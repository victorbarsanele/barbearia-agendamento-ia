import { StatusAgendamento } from '@prisma/client';
import { toZonedTime } from 'date-fns-tz';
import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as loteAgendamentoRepository from '../repositories/loteAgendamento.repository';
import * as pacoteClienteRepository from '../repositories/pacoteCliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import { TIME_ZONE as HORARIO_TIME_ZONE } from './horario-funcionamento.service';
import { estaDentroDoHorarioDeAlmoco } from './horario-funcionamento';
import * as horarioFuncionamentoService from './horario-funcionamento.service';

export const TIME_ZONE = HORARIO_TIME_ZONE;
export const MIN_ANTECEDENCIA_MS = 60 * 60 * 1000;

function formatarAntecedenciaMinima(ms: number): string {
    const minutos = ms / (60 * 1000);

    if (minutos % 60 === 0) {
        const horas = minutos / 60;
        return horas === 1 ? '1 hora' : `${horas} horas`;
    }

    return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
}

interface CriarAgendamentoData {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    dataHoraInicio: string;
    registroRetroativo?: boolean;
    origem?: 'PAINEL' | 'GEMINI';
}

interface SlotLote {
    data: string;
    horario: string;
}

interface LoteAgendamentoData {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    slots: SlotLote[];
    origem?: 'PAINEL' | 'GEMINI';
}

function montarDataHoraInicio(slot: SlotLote): string {
    return `${slot.data}T${slot.horario}:00-03:00`;
}

interface AtualizarAgendamentoData {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
    status: StatusAgendamento;
    notificarCliente?: boolean;
    origem?: 'PAINEL' | 'GEMINI';
}

function converterParaData(valor: string): Date {
    const possuiTimezoneExplicito = /(?:Z|[+-]\d{2}:\d{2})$/i.test(valor);

    if (!possuiTimezoneExplicito) {
        throw new AppError(
            'Data/hora de início deve incluir timezone explícito (ex: 2026-06-30T01:00:00-03:00 ou 2026-06-30T04:00:00Z).',
            400,
        );
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
        throw new AppError('Data/hora de início inválida.', 400);
    }

    return data;
}

function adicionarMinutos(data: Date, minutos: number): Date {
    return new Date(data.getTime() + minutos * 60 * 1000);
}

function formatarDataHoraBrasilia(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(data);
}

function formatarDataBrasilia(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(data);
}

function formatarHorarioBrasilia(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(data);
}

function formatarMinutosComoHorario(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return `${String(horas).padStart(2, '0')}h${String(minutosRestantes).padStart(2, '0')}`;
}

async function enviarMensagemRemarcacao(
    telefone: string | null,
    nomeCliente: string,
    nomeServico: string,
    dataHoraInicio: Date,
): Promise<void> {
    if (!telefone) {
        return;
    }

    const barberPhone =
        process.env.BARBER_PHONE?.trim() || 'o barbeiro diretamente';

    const mensagem = [
        `Olá ${nomeCliente}! Seu agendamento foi remarcado pelo barbeiro.`,
        `Nova data: ${formatarDataBrasilia(dataHoraInicio)}`,
        `Novo horário: ${formatarHorarioBrasilia(dataHoraInicio)} (horário de Brasília)`,
        `Serviço: ${nomeServico}`,
        `Dúvidas? Entre em contato com o barbeiro: ${barberPhone}`,
    ].join('\n');

    const { addToHistory, sendWhatsAppText } = await import('./gemini.service');
    await sendWhatsAppText(telefone, mensagem);
    addToHistory(telefone, 'model', mensagem);
}

async function enviarMensagemCancelamento(
    telefone: string | null,
    nomeCliente: string,
    nomeServico: string,
    dataHoraInicio: Date,
): Promise<void> {
    if (!telefone) {
        return;
    }

    const barberPhone =
        process.env.BARBER_PHONE?.trim() || 'o barbeiro diretamente';

    const mensagem = [
        `Olá ${nomeCliente}! Seu agendamento foi cancelado pelo barbeiro.`,
        `Data: ${formatarDataBrasilia(dataHoraInicio)}`,
        `Horário: ${formatarHorarioBrasilia(dataHoraInicio)} (horário de Brasília)`,
        `Serviço: ${nomeServico}`,
        `Dúvidas? Entre em contato com o barbeiro: ${barberPhone}`,
    ].join('\n');

    const { addToHistory, sendWhatsAppText } = await import('./gemini.service');
    await sendWhatsAppText(telefone, mensagem);
    addToHistory(telefone, 'model', mensagem);
}

function validarAntecedenciaMinima(dataHoraInicio: Date): void {
    const agora = toZonedTime(new Date(), TIME_ZONE);
    const inicioEmBrasilia = toZonedTime(dataHoraInicio, TIME_ZONE);

    if (inicioEmBrasilia.getTime() <= agora.getTime()) {
        throw new AppError('Agendamento não pode ser feito no passado.', 422);
    }

    const diferencaEmMilissegundos =
        inicioEmBrasilia.getTime() - agora.getTime();

    if (diferencaEmMilissegundos < MIN_ANTECEDENCIA_MS) {
        throw new AppError(
            `Agendamento deve ser feito com no mínimo ${formatarAntecedenciaMinima(MIN_ANTECEDENCIA_MS)} de antecedência.`,
            422,
        );
    }
}

async function validarHorarioFuncionamento(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    permiteExtensaoFechamento: boolean,
): Promise<horarioFuncionamentoService.HorarioFuncionamentoConfig> {
    const configuracao =
        await horarioFuncionamentoService.carregarConfiguracao();
    const horario =
        horarioFuncionamentoService.obterHorarioFuncionamentoComConfiguracao(
            configuracao,
            dataHoraInicio,
        );

    if (!horario) {
        throw new AppError(
            'Barbearia funciona de segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).',
            422,
        );
    }

    if (
        !horarioFuncionamentoService.estaDentroDoHorarioDoAgendamentoComConfiguracao(
            [horario],
            dataHoraInicio,
            dataHoraFim,
            permiteExtensaoFechamento,
        )
    ) {
        throw new AppError(
            'Agendamento deve estar dentro do horário de funcionamento: segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).',
            422,
        );
    }

    return horario;
}

function validarNaoInterceptaAlmoco(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    horario: horarioFuncionamentoService.HorarioFuncionamentoConfig,
): void {
    if (estaDentroDoHorarioDeAlmoco(horario, dataHoraInicio, dataHoraFim)) {
        throw new AppError(
            `Agendamento não pode ocorrer no horário de almoço (${formatarMinutosComoHorario(horario.almocoInicioMinutos!)} às ${formatarMinutosComoHorario(horario.almocoFimMinutos!)}).`,
            422,
        );
    }
}

async function carregarDependencias(clienteId: string, servicoId: string) {
    const cliente = await clienteRepository.buscarPorId(clienteId);
    if (!cliente) {
        throw new AppError('Cliente não encontrado.', 404);
    }

    const servico = await servicoRepository.buscarPorId(servicoId);
    if (!servico) {
        throw new AppError('Serviço não encontrado.', 404);
    }

    return { cliente, servico };
}

async function validarConflito(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    ignorarAgendamentoId?: string,
): Promise<void> {
    // Há conflito quando um intervalo existente começa antes do novo fim
    // e termina depois do novo início.
    const conflito = await agendamentoRepository.buscarConflito({
        dataHoraInicio,
        dataHoraFim,
        ignorarAgendamentoId,
    });

    if (conflito) {
        throw new AppError('Já existe um agendamento nesse horário.', 409);
    }
}

async function validarNaoInterceptaBloqueio(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    origem: 'PAINEL' | 'GEMINI' = 'PAINEL',
): Promise<void> {
    const bloqueio = await bloqueioRepository.buscarConflito(
        dataHoraInicio,
        dataHoraFim,
        origem,
    );

    if (bloqueio) {
        throw new AppError(
            `Horário bloqueado pelo barbeiro: ${bloqueio.motivo}.`,
            409,
        );
    }
}

async function validarPacoteCliente(
    pacoteClienteId: string | undefined,
    servicoId: string,
): Promise<pacoteClienteRepository.PacoteClienteComPacote | null> {
    if (!pacoteClienteId) {
        return null;
    }

    const pacoteCliente =
        await pacoteClienteRepository.buscarPorId(pacoteClienteId);

    if (!pacoteCliente) {
        throw new AppError('Pacote do cliente não encontrado.', 404);
    }

    if (pacoteCliente.status !== 'ATIVO') {
        throw new AppError('Pacote do cliente não está ativo.', 400);
    }

    if (pacoteCliente.quantidadeRestante <= 0) {
        throw new AppError('Pacote do cliente está esgotado.', 400);
    }

    const servicoIncluso = pacoteCliente.pacote?.servicos?.some(
        (item) => item.servicoId === servicoId,
    );
    if (!servicoIncluso) {
        throw new AppError(
            'Este serviço não está incluso no pacote selecionado.',
            400,
        );
    }

    return pacoteCliente;
}

function validarStatusPermiteVinculo(agendamento: {
    status: StatusAgendamento;
    concluido: boolean;
}): void {
    if (
        agendamento.concluido ||
        agendamento.status === StatusAgendamento.CONCLUIDO ||
        agendamento.status === StatusAgendamento.CANCELADO
    ) {
        throw new AppError(
            'Não é possível alterar vínculo de pacote em agendamento concluído ou cancelado.',
            409,
        );
    }
}

async function validarDisponibilidade(
    dataHoraInicioStr: string,
    duracaoMinutos: number,
    permiteExtensaoFechamento: boolean,
    registroRetroativo = false,
    origem: 'PAINEL' | 'GEMINI' = 'PAINEL',
): Promise<{ dataHoraInicio: Date; dataHoraFim: Date }> {
    const dataHoraInicio = converterParaData(dataHoraInicioStr);
    const dataHoraFim = adicionarMinutos(dataHoraInicio, duracaoMinutos);

    if (!registroRetroativo) {
        validarAntecedenciaMinima(dataHoraInicio);
    }
    const horario = await validarHorarioFuncionamento(
        dataHoraInicio,
        dataHoraFim,
        permiteExtensaoFechamento,
    );
    validarNaoInterceptaAlmoco(dataHoraInicio, dataHoraFim, horario);
    await validarNaoInterceptaBloqueio(dataHoraInicio, dataHoraFim, origem);
    await validarConflito(dataHoraInicio, dataHoraFim);

    return { dataHoraInicio, dataHoraFim };
}

export async function criar(data: CriarAgendamentoData) {
    try {
        const { servico } = await carregarDependencias(
            data.clienteId,
            data.servicoId,
        );
        await validarPacoteCliente(data.pacoteClienteId, data.servicoId);
        const { dataHoraInicio, dataHoraFim } = await validarDisponibilidade(
            data.dataHoraInicio,
            servico.duracaoMinutos,
            servico.permiteExtensaoFechamento,
            data.registroRetroativo,
            data.origem,
        );

        return await agendamentoRepository.criar({
            clienteId: data.clienteId,
            servicoId: data.servicoId,
            pacoteClienteId: data.pacoteClienteId ?? null,
            dataHoraInicio,
            dataHoraFim,
            status: StatusAgendamento.AGENDADO,
        });
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao criar agendamento.', 500);
    }
}

export async function simularLote(data: LoteAgendamentoData) {
    try {
        const { servico } = await carregarDependencias(
            data.clienteId,
            data.servicoId,
        );
        await validarPacoteCliente(data.pacoteClienteId, data.servicoId);

        const disponiveis: SlotLote[] = [];
        const conflitos: (SlotLote & { motivo: string })[] = [];

        for (const slot of data.slots) {
            try {
                await validarDisponibilidade(
                    montarDataHoraInicio(slot),
                    servico.duracaoMinutos,
                    servico.permiteExtensaoFechamento,
                    false,
                    data.origem,
                );
                disponiveis.push(slot);
            } catch (error) {
                const motivo =
                    error instanceof AppError
                        ? error.message
                        : 'Erro ao validar disponibilidade do horário.';
                conflitos.push({ ...slot, motivo });
            }
        }

        return { disponiveis, conflitos };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao simular lote de agendamentos.', 500);
    }
}

export async function criarLote(data: LoteAgendamentoData) {
    try {
        const { servico } = await carregarDependencias(
            data.clienteId,
            data.servicoId,
        );
        await validarPacoteCliente(data.pacoteClienteId, data.servicoId);

        const lote = await loteAgendamentoRepository.criar({
            clienteId: data.clienteId,
            servicoId: data.servicoId,
            pacoteClienteId: data.pacoteClienteId ?? null,
        });

        const criados: {
            agendamentoId: string;
            data: string;
            horario: string;
        }[] = [];
        const falhados: (SlotLote & { motivo: string })[] = [];

        // Sequencial e não-atômico: cada slot é validado e inserido isoladamente,
        // para que um conflito em um item não reverta os demais já inseridos.
        for (const slot of data.slots) {
            try {
                const { dataHoraInicio, dataHoraFim } =
                    await validarDisponibilidade(
                        montarDataHoraInicio(slot),
                        servico.duracaoMinutos,
                        servico.permiteExtensaoFechamento,
                        false,
                        data.origem,
                    );

                const agendamento = await agendamentoRepository.criar({
                    clienteId: data.clienteId,
                    servicoId: data.servicoId,
                    pacoteClienteId: data.pacoteClienteId ?? null,
                    loteId: lote.id,
                    dataHoraInicio,
                    dataHoraFim,
                    status: StatusAgendamento.AGENDADO,
                });

                criados.push({
                    agendamentoId: agendamento.id,
                    data: slot.data,
                    horario: slot.horario,
                });
            } catch (error) {
                const motivo =
                    error instanceof AppError
                        ? error.message
                        : 'Erro ao criar agendamento.';
                falhados.push({ ...slot, motivo });
            }
        }

        return { loteId: lote.id, criados, falhados };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao criar lote de agendamentos.', 500);
    }
}

export async function listarTodos() {
    try {
        return await agendamentoRepository.listarTodos();
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao listar agendamentos.', 500);
    }
}

export async function buscarPorId(id: string) {
    try {
        const agendamento = await agendamentoRepository.buscarPorId(id);

        if (!agendamento) {
            throw new AppError('Agendamento não encontrado.', 404);
        }

        return agendamento;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao buscar agendamento.', 500);
    }
}

export async function atualizar(id: string, data: AtualizarAgendamentoData) {
    try {
        const agendamentoExistente =
            await agendamentoRepository.buscarPorId(id);

        if (!agendamentoExistente) {
            throw new AppError('Agendamento não encontrado.', 404);
        }

        const { servico } = await carregarDependencias(
            data.clienteId,
            data.servicoId,
        );
        const dataHoraInicio = converterParaData(data.dataHoraInicio);
        const dataHoraFim = adicionarMinutos(
            dataHoraInicio,
            servico.duracaoMinutos,
        );

        validarAntecedenciaMinima(dataHoraInicio);
        const horario = await validarHorarioFuncionamento(
            dataHoraInicio,
            dataHoraFim,
            servico.permiteExtensaoFechamento,
        );
        if (data.status !== StatusAgendamento.CANCELADO) {
            validarNaoInterceptaAlmoco(dataHoraInicio, dataHoraFim, horario);
            await validarNaoInterceptaBloqueio(
                dataHoraInicio,
                dataHoraFim,
                data.origem,
            );
            await validarConflito(dataHoraInicio, dataHoraFim, id);
        }

        const dataHoraMudou =
            agendamentoExistente.dataHoraInicio.getTime() !==
            dataHoraInicio.getTime();
        const servicoMudou = agendamentoExistente.servicoId !== data.servicoId;

        const agendamentoAtualizado = await agendamentoRepository.atualizar(
            id,
            {
                clienteId: data.clienteId,
                servicoId: data.servicoId,
                dataHoraInicio,
                dataHoraFim,
                status: data.status,
            },
        );

        if ((dataHoraMudou || servicoMudou) && data.notificarCliente === true) {
            try {
                await enviarMensagemRemarcacao(
                    agendamentoAtualizado.cliente.telefone,
                    agendamentoAtualizado.cliente.nome,
                    agendamentoAtualizado.servico.nome,
                    agendamentoAtualizado.dataHoraInicio,
                );
            } catch (error) {
                console.error(
                    '[AGENDAMENTO SERVICE] Falha ao enviar mensagem de remarcação no WhatsApp',
                    error,
                );
            }
        }

        return agendamentoAtualizado;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao atualizar agendamento.', 500);
    }
}

export async function cancelar(
    id: string,
    notificarCliente = false,
    aplicarParaLote = false,
) {
    try {
        const agendamento = await agendamentoRepository.buscarPorId(id);

        if (!agendamento) {
            throw new AppError('Agendamento não encontrado.', 404);
        }

        const agendamentoCancelado = await agendamentoRepository.cancelar(id);

        if (notificarCliente) {
            try {
                await enviarMensagemCancelamento(
                    agendamentoCancelado.cliente.telefone,
                    agendamentoCancelado.cliente.nome,
                    agendamentoCancelado.servico.nome,
                    agendamentoCancelado.dataHoraInicio,
                );
            } catch (error) {
                console.error(
                    '[AGENDAMENTO SERVICE] Falha ao enviar mensagem de cancelamento no WhatsApp',
                    error,
                );
            }
        }

        const agendamentosAfetados = agendamento.loteId
            ? await propagarStatusParaLote(
                  agendamento.loteId,
                  id,
                  aplicarParaLote,
                  (siblingId) => agendamentoRepository.cancelar(siblingId),
              )
            : [];

        return { ...agendamentoCancelado, agendamentosAfetados };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao cancelar agendamento.', 500);
    }
}

async function propagarStatusParaLote(
    loteId: string,
    idOrigem: string,
    aplicarParaLote: boolean,
    aplicar: (siblingId: string) => Promise<unknown>,
): Promise<string[]> {
    if (!aplicarParaLote) {
        return [];
    }

    const siblings = await agendamentoRepository.listarSiblingsEditaveisDoLote(
        loteId,
        idOrigem,
    );

    const afetados: string[] = [];
    for (const sibling of siblings) {
        try {
            await aplicar(sibling.id);
            afetados.push(sibling.id);
        } catch (error) {
            console.error(
                '[AGENDAMENTO SERVICE] Falha ao propagar status para agendamento do lote',
                sibling.id,
                error,
            );
        }
    }

    return afetados;
}

async function concluirInterno(id: string) {
    const agendamento = await agendamentoRepository.buscarPorId(id);

    if (!agendamento) {
        throw new AppError('Agendamento não encontrado.', 404);
    }

    if (agendamento.concluido) {
        throw new AppError('Agendamento já está concluído.', 409);
    }

    if (!agendamento.pacoteClienteId) {
        throw new AppError('Agendamento não vinculado a pacote.', 400);
    }

    const pacoteCliente = await pacoteClienteRepository.buscarPorId(
        agendamento.pacoteClienteId,
    );
    if (!pacoteCliente || pacoteCliente.status !== 'ATIVO') {
        throw new AppError(
            'Não é possível concluir: pacote do cliente não está ativo.',
            409,
        );
    }

    const resultado = await agendamentoRepository.concluirComPacote(
        id,
        agendamento.pacoteClienteId,
    );

    return { agendamento, resultado };
}

export async function concluir(id: string, aplicarParaLote = false) {
    try {
        const { agendamento, resultado } = await concluirInterno(id);

        const agendamentosAfetados = agendamento.loteId
            ? await propagarStatusParaLote(
                  agendamento.loteId,
                  id,
                  aplicarParaLote,
                  async (siblingId) => {
                      await concluirInterno(siblingId);
                  },
              )
            : [];

        return { ...resultado.agendamento, agendamentosAfetados };
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao concluir agendamento.', 500);
    }
}

export async function vincularPacote(id: string, pacoteClienteId: string) {
    try {
        const agendamento = await agendamentoRepository.buscarPorId(id);

        if (!agendamento) {
            throw new AppError('Agendamento não encontrado.', 404);
        }

        validarStatusPermiteVinculo(agendamento);

        const pacoteCliente = await validarPacoteCliente(
            pacoteClienteId,
            agendamento.servicoId,
        );

        if (pacoteCliente?.clienteId !== agendamento.clienteId) {
            throw new AppError(
                'Pacote não pertence ao cliente do agendamento.',
                400,
            );
        }

        return await agendamentoRepository.atualizarPacoteClienteId(
            id,
            pacoteClienteId,
        );
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao vincular pacote ao agendamento.', 500);
    }
}

export async function desvincularPacote(id: string) {
    try {
        const agendamento = await agendamentoRepository.buscarPorId(id);

        if (!agendamento) {
            throw new AppError('Agendamento não encontrado.', 404);
        }

        validarStatusPermiteVinculo(agendamento);

        if (!agendamento.pacoteClienteId) {
            throw new AppError('Agendamento não está vinculado a pacote.', 400);
        }

        return await agendamentoRepository.atualizarPacoteClienteId(id, null);
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao desvincular pacote do agendamento.', 500);
    }
}
