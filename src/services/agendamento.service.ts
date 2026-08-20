import { StatusAgendamento } from '@prisma/client';
import { toZonedTime } from 'date-fns-tz';
import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import {
    ehDiaDeFuncionamento,
    HORA_ABERTURA,
    HORA_FECHAMENTO,
    TIME_ZONE as HORARIO_TIME_ZONE,
} from './horario-funcionamento';

export const TIME_ZONE = HORARIO_TIME_ZONE;
export const MIN_ANTECEDENCIA_MS = 60 * 60 * 1000;
const HORA_ALMOCO_INICIO = 11 * 60 + 30;
const HORA_ALMOCO_FIM = 12 * 60;

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
    dataHoraInicio: string;
}

interface AtualizarAgendamentoData {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
    status: StatusAgendamento;
    notificarCliente?: boolean;
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

function validarHorarioFuncionamento(
    dataHoraInicio: Date,
    dataHoraFim: Date,
): void {
    const inicioEmBrasilia = toZonedTime(dataHoraInicio, TIME_ZONE);
    const fimEmBrasilia = toZonedTime(dataHoraFim, TIME_ZONE);

    const diaInicio = inicioEmBrasilia.getDay();
    const diaFim = fimEmBrasilia.getDay();

    if (!ehDiaDeFuncionamento(dataHoraInicio)) {
        throw new AppError(
            'Barbearia funciona de segunda a sábado, das 9h às 19h (horário de Brasília).',
            422,
        );
    }

    const minutosInicio =
        inicioEmBrasilia.getHours() * 60 + inicioEmBrasilia.getMinutes();
    const minutosFim =
        fimEmBrasilia.getHours() * 60 + fimEmBrasilia.getMinutes();
    const minutosAbertura = HORA_ABERTURA * 60;
    const minutosFechamento = HORA_FECHAMENTO * 60;

    if (
        diaFim !== diaInicio ||
        minutosInicio < minutosAbertura ||
        minutosFim > minutosFechamento
    ) {
        throw new AppError(
            `Agendamento deve estar dentro do horário de funcionamento: segunda a sábado, das ${HORA_ABERTURA}h às ${HORA_FECHAMENTO}h (horário de Brasília).`,
            422,
        );
    }
}

function validarNaoInterceptaAlmoco(
    dataHoraInicio: Date,
    dataHoraFim: Date,
): void {
    const inicioEmBrasilia = toZonedTime(dataHoraInicio, TIME_ZONE);
    const fimEmBrasilia = toZonedTime(dataHoraFim, TIME_ZONE);

    const minutosInicio =
        inicioEmBrasilia.getHours() * 60 + inicioEmBrasilia.getMinutes();
    const minutosFim =
        fimEmBrasilia.getHours() * 60 + fimEmBrasilia.getMinutes();

    const sobrepoeAlmoco =
        minutosInicio < HORA_ALMOCO_FIM && minutosFim > HORA_ALMOCO_INICIO;

    if (sobrepoeAlmoco) {
        throw new AppError(
            'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
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
): Promise<void> {
    const bloqueio = await bloqueioRepository.buscarConflito(
        dataHoraInicio,
        dataHoraFim,
    );

    if (bloqueio) {
        throw new AppError(
            `Horário bloqueado pelo barbeiro: ${bloqueio.motivo}.`,
            409,
        );
    }
}

export async function criar(data: CriarAgendamentoData) {
    try {
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
        validarHorarioFuncionamento(dataHoraInicio, dataHoraFim);
        validarNaoInterceptaAlmoco(dataHoraInicio, dataHoraFim);
        await validarNaoInterceptaBloqueio(dataHoraInicio, dataHoraFim);
        await validarConflito(dataHoraInicio, dataHoraFim);

        return await agendamentoRepository.criar({
            clienteId: data.clienteId,
            servicoId: data.servicoId,
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
        validarHorarioFuncionamento(dataHoraInicio, dataHoraFim);
        if (data.status !== StatusAgendamento.CANCELADO) {
            validarNaoInterceptaAlmoco(dataHoraInicio, dataHoraFim);
            await validarNaoInterceptaBloqueio(dataHoraInicio, dataHoraFim);
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

export async function cancelar(id: string, notificarCliente = false) {
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

        return agendamentoCancelado;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao cancelar agendamento.', 500);
    }
}
