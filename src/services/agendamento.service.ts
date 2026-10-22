import { Prisma, StatusAgendamento } from '@prisma/client';
import { toZonedTime } from 'date-fns-tz';
import { getAgendamentoConfig } from '../config/agendamento';
import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as loteAgendamentoRepository from '../repositories/loteAgendamento.repository';
import * as pacoteClienteRepository from '../repositories/pacoteCliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import { isAgendamentoConcluido } from '../utils/agendamento';
import { TIME_ZONE as HORARIO_TIME_ZONE } from './horario-funcionamento.service';
import { estaDentroDoHorarioDeAlmoco } from './horario-funcionamento';
import * as horarioFuncionamentoService from './horario-funcionamento.service';

export const TIME_ZONE = HORARIO_TIME_ZONE;

export function formatarAntecedenciaMinima(minutos: number): string {
    if (minutos % 60 === 0) {
        const horas = minutos / 60;
        return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    }

    return `${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`;
}

interface CriarAgendamentoData {
    clienteId: string;
    servicoId: string;
    pacoteId?: string;
    pacoteClienteId?: string;
    dataHoraInicio: string;
    registroRetroativo?: boolean;
    permitirForaDoExpediente?: boolean;
    origem?: 'PAINEL' | 'GEMINI';
}

interface SlotLote {
    data: string;
    horario: string;
}

interface LoteAgendamentoData {
    clienteId: string;
    servicoId: string;
    pacoteId?: string;
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
    permitirForaDoExpediente?: boolean;
    origem?: 'PAINEL' | 'GEMINI';
}

type MotivoForaDoExpediente =
    | 'fora_funcionamento'
    | 'dia_fechado'
    | 'almoco'
    | 'bloqueio_total'
    | 'bloqueio_so_painel';

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

function formatarHorarioCompletoTemplate(
    data: Date,
    incluirDiaSemana: boolean,
): string {
    const dataFormatada = new Intl.DateTimeFormat('pt-BR', {
        ...(incluirDiaSemana ? { weekday: 'long' as const } : {}),
        day: '2-digit',
        month: '2-digit',
        timeZone: TIME_ZONE,
    }).format(data);

    return `${dataFormatada} às ${formatarHorarioBrasilia(data)}`;
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

    const { addToHistory } = await import('./gemini.service');
    const { enviarNotificacaoWhatsApp } =
        await import('./whatsapp-notification.service');
    const mensagem = await enviarNotificacaoWhatsApp(
        'reagendamento',
        telefone,
        {
            nomeCliente,
            novaData: formatarDataBrasilia(dataHoraInicio),
            novoHorario: formatarHorarioBrasilia(dataHoraInicio),
            novoHorarioCompleto: formatarHorarioCompletoTemplate(
                dataHoraInicio,
                true,
            ),
            servico: nomeServico,
            contatoBarbeiro: barberPhone,
        },
    );
    if (mensagem) {
        addToHistory(telefone, 'model', mensagem);
    }
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

    const { addToHistory } = await import('./gemini.service');
    const { enviarNotificacaoWhatsApp } =
        await import('./whatsapp-notification.service');
    const mensagem = await enviarNotificacaoWhatsApp('cancelamento', telefone, {
        nomeCliente,
        data: formatarDataBrasilia(dataHoraInicio),
        horario: formatarHorarioBrasilia(dataHoraInicio),
        dataHoraCompleta: formatarHorarioCompletoTemplate(
            dataHoraInicio,
            false,
        ),
        servico: nomeServico,
        contatoBarbeiro: barberPhone,
    });
    if (mensagem) {
        addToHistory(telefone, 'model', mensagem);
    }
}

function validarAntecedenciaMinima(dataHoraInicio: Date): void {
    const agora = toZonedTime(new Date(), TIME_ZONE);
    const inicioEmBrasilia = toZonedTime(dataHoraInicio, TIME_ZONE);

    if (inicioEmBrasilia.getTime() <= agora.getTime()) {
        throw new AppError('Agendamento não pode ser feito no passado.', 422);
    }

    const diferencaEmMilissegundos =
        inicioEmBrasilia.getTime() - agora.getTime();
    const minAntecedenciaMinutos =
        getAgendamentoConfig().minAntecedenciaMinutos;

    if (diferencaEmMilissegundos < minAntecedenciaMinutos * 60 * 1000) {
        throw new AppError(
            `Agendamento deve ser feito com no mínimo ${formatarAntecedenciaMinima(minAntecedenciaMinutos)} de antecedência.`,
            422,
        );
    }
}

async function validarHorarioFuncionamento(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    permiteExtensaoFechamento: boolean,
    configuracaoCarregada?: horarioFuncionamentoService.HorarioFuncionamentoConfig[],
): Promise<horarioFuncionamentoService.HorarioFuncionamentoConfig> {
    const configuracao =
        configuracaoCarregada ??
        (await horarioFuncionamentoService.carregarConfiguracao());
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
    clienteId?: string,
): Promise<void> {
    // Há conflito quando um intervalo existente começa antes do novo fim
    // e termina depois do novo início.
    const conflito = await agendamentoRepository.buscarConflito({
        dataHoraInicio,
        dataHoraFim,
        ignorarAgendamentoId,
    });

    if (conflito) {
        if (clienteId && conflito.clienteId === clienteId) {
            throw new AppError('Você já tem agendamento nesse horário.', 409);
        }
        throw new AppError('Já existe um agendamento nesse horário.', 409);
    }
}

function validarMesmoDiaEmBrasilia(
    dataHoraInicio: Date,
    dataHoraFim: Date,
): void {
    const inicio = toZonedTime(dataHoraInicio, TIME_ZONE);
    const fim = toZonedTime(dataHoraFim, TIME_ZONE);

    if (
        inicio.getFullYear() !== fim.getFullYear() ||
        inicio.getMonth() !== fim.getMonth() ||
        inicio.getDate() !== fim.getDate()
    ) {
        throw new AppError(
            'Agendamento deve começar e terminar no mesmo dia (horário de Brasília).',
            422,
        );
    }
}

async function coletarMotivosForaDoExpediente(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    permiteExtensaoFechamento: boolean,
    origem: 'PAINEL' | 'GEMINI',
): Promise<{
    motivos: MotivoForaDoExpediente[];
    bloqueio: Awaited<ReturnType<typeof bloqueioRepository.buscarConflito>>;
    horario: horarioFuncionamentoService.HorarioFuncionamentoConfig | null;
}> {
    const configuracao =
        await horarioFuncionamentoService.carregarConfiguracao();
    const horario =
        horarioFuncionamentoService.obterHorarioFuncionamentoComConfiguracao(
            configuracao,
            dataHoraInicio,
        );
    const motivos: MotivoForaDoExpediente[] = [];

    if (!horario) {
        motivos.push('dia_fechado');
    } else {
        if (
            !horarioFuncionamentoService.estaDentroDoHorarioDoAgendamentoComConfiguracao(
                [horario],
                dataHoraInicio,
                dataHoraFim,
                permiteExtensaoFechamento,
            )
        ) {
            motivos.push('fora_funcionamento');
        }

        if (estaDentroDoHorarioDeAlmoco(horario, dataHoraInicio, dataHoraFim)) {
            motivos.push('almoco');
        }
    }

    const bloqueio = await bloqueioRepository.buscarConflito(
        dataHoraInicio,
        dataHoraFim,
        origem,
    );
    if (bloqueio && (origem === 'GEMINI' || bloqueio.escopo !== 'SO_PAINEL')) {
        motivos.push(
            bloqueio.escopo === 'SO_PAINEL'
                ? 'bloqueio_so_painel'
                : 'bloqueio_total',
        );
    }

    return { motivos, bloqueio, horario };
}

function rejeitarForaDoExpediente(
    motivos: MotivoForaDoExpediente[],
    bloqueio: Awaited<ReturnType<typeof bloqueioRepository.buscarConflito>>,
    horario: horarioFuncionamentoService.HorarioFuncionamentoConfig | null,
): void {
    if (motivos.length === 0) {
        return;
    }

    let message: string;
    let statusCode: number;
    if (motivos.includes('dia_fechado')) {
        message =
            'Barbearia funciona de segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).';
        statusCode = 422;
    } else if (motivos.includes('fora_funcionamento')) {
        message =
            'Agendamento deve estar dentro do horário de funcionamento: segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).';
        statusCode = 422;
    } else if (motivos.includes('almoco')) {
        message = `Agendamento não pode ocorrer no horário de almoço (${formatarMinutosComoHorario(horario!.almocoInicioMinutos!)} às ${formatarMinutosComoHorario(horario!.almocoFimMinutos!)}).`;
        statusCode = 422;
    } else {
        message = `Horário bloqueado pelo barbeiro: ${bloqueio?.motivo ?? 'Bloqueio administrativo'}.`;
        statusCode = 409;
    }

    throw new AppError(message, statusCode, {
        code: 'FORA_DO_EXPEDIENTE',
        motivos,
    });
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

    validarPacoteClienteEncontrado(pacoteCliente, servicoId);

    return pacoteCliente;
}

function validarPacoteClienteEncontrado(
    pacoteCliente: pacoteClienteRepository.PacoteClienteComPacote,
    servicoId: string,
): void {
    if (pacoteCliente.status !== 'ATIVO') {
        throw new AppError('Pacote do cliente não está ativo.', 400);
    }

    const servicoIncluso = pacoteCliente.pacote?.servicos?.find(
        (item) => item.servicoId === servicoId,
    );
    if (!servicoIncluso) {
        throw new AppError(
            'Este serviço não está incluso no pacote selecionado.',
            400,
        );
    }

    const saldoServico = pacoteCliente.servicos.find(
        (item) => item.servicoId === servicoId,
    );
    if (!saldoServico || saldoServico.quantidadeRestante <= 0) {
        throw new AppError('Pacote do cliente está esgotado.', 400);
    }
}

async function criarComPacoteDoCatalogo(
    dados: Parameters<
        typeof agendamentoRepository.criarComNumeroNoPacoteNaTransacao
    >[1],
    pacoteId: string,
): Promise<agendamentoRepository.AgendamentoComRelacoes> {
    return pacoteClienteRepository.transacionar(async (tx) => {
        const clienteExiste =
            await clienteRepository.bloquearParaCriacaoDePacote(
                tx,
                dados.clienteId,
            );
        if (!clienteExiste) {
            throw new AppError('Cliente não encontrado.', 404);
        }

        const resolvido = await resolverPacoteDoCatalogoNaTransacao(
            tx,
            dados.clienteId,
            pacoteId,
            dados.servicoId,
            true,
        );
        if (resolvido.pacoteCliente) {
            validarPacoteClienteEncontrado(
                resolvido.pacoteCliente,
                dados.servicoId,
            );
        }

        return agendamentoRepository.criarComNumeroNoPacoteNaTransacao(
            tx,
            { ...dados, pacoteClienteId: resolvido.pacoteClienteId! },
            resolvido.pacoteClienteId!,
            dados.servicoId,
        );
    });
}

async function resolverPacoteDoCatalogoNaTransacao(
    tx: Prisma.TransactionClient,
    clienteId: string,
    pacoteId: string,
    servicoId: string,
    criarSeAusente: boolean,
): Promise<{
    pacoteClienteId: string | null;
    pacoteCliente: pacoteClienteRepository.PacoteClienteComPacote | null;
    capacidade: number;
}> {
    const pacoteClienteAtivo =
        await pacoteClienteRepository.buscarAtivoPorClienteId(clienteId, tx);

    if (pacoteClienteAtivo) {
        if (pacoteClienteAtivo.pacoteId !== pacoteId) {
            throw new AppError(
                'Cliente já possui pacote ativo diferente do pacote selecionado.',
                409,
            );
        }
        const servicoDoPacote = pacoteClienteAtivo.pacote?.servicos?.find(
            (item) => item.servicoId === servicoId,
        );
        const saldoServico = pacoteClienteAtivo.servicos.find(
            (item) => item.servicoId === servicoId,
        );
        if (!servicoDoPacote || !saldoServico) {
            throw new AppError(
                'Este serviço não está incluso no pacote selecionado.',
                400,
            );
        }
        if (
            !Number.isInteger(servicoDoPacote.quantidadeTotal) ||
            servicoDoPacote.quantidadeTotal < 1
        ) {
            throw new AppError(
                'Quantidade do serviço no pacote deve ser maior que zero.',
                400,
            );
        }
        const ocupados = await tx.agendamento.count({
            where: {
                pacoteClienteId: pacoteClienteAtivo.id,
                servicoId,
                status: { not: StatusAgendamento.CANCELADO },
                numeroNoPacote: { not: null },
            },
        });
        return {
            pacoteClienteId: pacoteClienteAtivo.id,
            pacoteCliente: pacoteClienteAtivo,
            capacidade: Math.max(
                saldoServico.quantidadeTotal -
                    saldoServico.usosAnteriores -
                    ocupados,
                0,
            ),
        };
    }

    const pacote = await tx.pacote.findUnique({
        where: { id: pacoteId },
        include: { servicos: true },
    });
    if (!pacote) {
        throw new AppError('Pacote não encontrado.', 404);
    }
    const servicoDoPacote = pacote.servicos.find(
        (item) => item.servicoId === servicoId,
    );
    if (!servicoDoPacote) {
        throw new AppError(
            'Este serviço não está incluso no pacote selecionado.',
            400,
        );
    }
    if (servicoDoPacote.quantidadeTotal < 1) {
        throw new AppError(
            'Quantidade do serviço no pacote deve ser maior que zero.',
            400,
        );
    }
    if (!criarSeAusente) {
        return {
            pacoteClienteId: null,
            pacoteCliente: null,
            capacidade: servicoDoPacote.quantidadeTotal,
        };
    }

    const criado = await pacoteClienteRepository.criarNaTransacao(tx, {
        clienteId,
        pacoteId,
        dataInicio: new Date(),
        servicos: pacote.servicos.map((item) => ({
            servicoId: item.servicoId,
            quantidadeTotal: item.quantidadeTotal,
            usosAnteriores: 0,
        })),
    });
    return {
        pacoteClienteId: criado.id,
        pacoteCliente: null,
        capacidade: servicoDoPacote.quantidadeTotal,
    };
}

function validarStatusPermiteVinculo(agendamento: {
    status: StatusAgendamento;
    concluido: boolean;
}): void {
    if (
        isAgendamentoConcluido(agendamento) ||
        agendamento.status === StatusAgendamento.CANCELADO
    ) {
        throw new AppError(
            'Não é possível alterar vínculo de pacote em agendamento concluído ou cancelado.',
            409,
        );
    }
}

export async function validarDisponibilidade(
    dataHoraInicioStr: string,
    duracaoMinutos: number,
    permiteExtensaoFechamento: boolean,
    registroRetroativo = false,
    origem: 'PAINEL' | 'GEMINI' = 'PAINEL',
    clienteId?: string,
    permitirForaDoExpediente = false,
    ignorarAgendamentoId?: string,
): Promise<{ dataHoraInicio: Date; dataHoraFim: Date }> {
    const dataHoraInicio = converterParaData(dataHoraInicioStr);
    const dataHoraFim = adicionarMinutos(dataHoraInicio, duracaoMinutos);

    validarMesmoDiaEmBrasilia(dataHoraInicio, dataHoraFim);
    if (!registroRetroativo) {
        validarAntecedenciaMinima(dataHoraInicio);
    }

    await validarConflito(
        dataHoraInicio,
        dataHoraFim,
        ignorarAgendamentoId,
        clienteId,
    );

    const { motivos, bloqueio, horario } = await coletarMotivosForaDoExpediente(
        dataHoraInicio,
        dataHoraFim,
        permiteExtensaoFechamento,
        origem,
    );
    const overridePermitido =
        origem === 'PAINEL' && permitirForaDoExpediente === true;
    if (!overridePermitido) {
        rejeitarForaDoExpediente(motivos, bloqueio, horario);
    }

    return { dataHoraInicio, dataHoraFim };
}

export async function criar(data: CriarAgendamentoData) {
    try {
        if (data.pacoteId && data.pacoteClienteId) {
            throw new AppError(
                'Informe pacoteId ou pacoteClienteId, não ambos.',
                400,
            );
        }
        if (data.pacoteId && data.origem !== 'PAINEL') {
            throw new AppError(
                'Somente o painel pode criar agendamento com pacote do catálogo.',
                403,
            );
        }
        if (data.origem === 'GEMINI' && data.pacoteClienteId) {
            throw new AppError(
                'Gemini não pode vincular pacote a agendamento.',
                403,
            );
        }

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
            undefined,
            data.permitirForaDoExpediente,
        );

        const dados = {
            clienteId: data.clienteId,
            servicoId: data.servicoId,
            pacoteClienteId: data.pacoteClienteId ?? null,
            dataHoraInicio,
            dataHoraFim,
            status: StatusAgendamento.AGENDADO,
        };

        if (data.pacoteId) {
            return await criarComPacoteDoCatalogo(dados, data.pacoteId);
        }

        return data.pacoteClienteId
            ? await agendamentoRepository.criarComNumeroNoPacote(
                  dados,
                  data.pacoteClienteId,
                  data.servicoId,
              )
            : await agendamentoRepository.criar(dados);
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        throw new AppError('Erro ao criar agendamento.', 500);
    }
}

export async function simularLote(data: LoteAgendamentoData) {
    try {
        validarContratoLote(data);
        const { servico } = await carregarDependencias(
            data.clienteId,
            data.servicoId,
        );
        const pacoteCliente = await validarPacoteCliente(
            data.pacoteClienteId,
            data.servicoId,
        );

        const disponiveis: SlotLote[] = [];
        const conflitos: (SlotLote & { motivo: string })[] = [];
        const saldoServico = data.pacoteClienteId
            ? pacoteCliente?.servicos.find(
                  (item) => item.servicoId === data.servicoId,
              )
            : null;
        let capacidadeCatalogo: number | null = null;
        if (data.pacoteId) {
            const resolvido = await pacoteClienteRepository.transacionar((tx) =>
                resolverPacoteDoCatalogoNaTransacao(
                    tx,
                    data.clienteId,
                    data.pacoteId!,
                    data.servicoId,
                    false,
                ),
            );
            capacidadeCatalogo = resolvido.capacidade;
        }
        let vagasDePacote =
            capacidadeCatalogo !== null
                ? capacidadeCatalogo
                : saldoServico
                  ? saldoServico.quantidadeTotal -
                    (saldoServico.usosAnteriores ?? 0) -
                    (await agendamentoRepository.contarNaoCanceladosPorPacoteEServico(
                        data.pacoteClienteId!,
                        data.servicoId,
                    ))
                  : Number.POSITIVE_INFINITY;

        for (const slot of data.slots) {
            try {
                await validarDisponibilidade(
                    montarDataHoraInicio(slot),
                    servico.duracaoMinutos,
                    servico.permiteExtensaoFechamento,
                    false,
                    data.origem,
                );
                if (vagasDePacote > 0) {
                    disponiveis.push(slot);
                    vagasDePacote -= 1;
                } else {
                    conflitos.push({
                        ...slot,
                        motivo: `Todos os ${capacidadeCatalogo ?? Math.max((saldoServico?.quantidadeTotal ?? 0) - (saldoServico?.usosAnteriores ?? 0), 0)} usos restantes deste serviço no pacote já estão agendados ou concluídos.`,
                    });
                }
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
        validarContratoLote(data);
        if (data.pacoteId) {
            return await criarLoteComPacoteDoCatalogo(data);
        }

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

                const dados = {
                    clienteId: data.clienteId,
                    servicoId: data.servicoId,
                    pacoteClienteId: data.pacoteClienteId ?? null,
                    loteId: lote.id,
                    dataHoraInicio,
                    dataHoraFim,
                    status: StatusAgendamento.AGENDADO,
                };
                const agendamento = data.pacoteClienteId
                    ? await agendamentoRepository.criarComNumeroNoPacote(
                          dados,
                          data.pacoteClienteId,
                          data.servicoId,
                      )
                    : await agendamentoRepository.criar(dados);

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

function validarContratoLote(data: LoteAgendamentoData): void {
    if (data.pacoteId && data.pacoteClienteId) {
        throw new AppError(
            'Informe pacoteId ou pacoteClienteId, não ambos.',
            400,
        );
    }
    if (data.pacoteId && data.origem !== 'PAINEL') {
        throw new AppError(
            'Somente o painel pode criar agendamento com pacote do catálogo.',
            403,
        );
    }
    if (data.pacoteId && data.slots.length > 20) {
        throw new AppError(
            'Lotes com pacote do catálogo aceitam no máximo 20 horários.',
            400,
        );
    }
}

interface ValidacaoLoteTransacional {
    tx: Prisma.TransactionClient;
    clienteId: string;
    horarios: horarioFuncionamentoService.HorarioFuncionamentoConfig[];
    bloqueios: Awaited<ReturnType<typeof bloqueioRepository.listarTodos>>;
}

async function validarDisponibilidadeNoLote(
    slot: SlotLote,
    servico: { duracaoMinutos: number; permiteExtensaoFechamento: boolean },
    contexto: ValidacaoLoteTransacional,
): Promise<{ dataHoraInicio: Date; dataHoraFim: Date }> {
    const dataHoraInicio = converterParaData(montarDataHoraInicio(slot));
    const dataHoraFim = adicionarMinutos(
        dataHoraInicio,
        servico.duracaoMinutos,
    );
    validarAntecedenciaMinima(dataHoraInicio);
    const horario = await validarHorarioFuncionamento(
        dataHoraInicio,
        dataHoraFim,
        servico.permiteExtensaoFechamento,
        contexto.horarios,
    );
    validarNaoInterceptaAlmoco(dataHoraInicio, dataHoraFim, horario);

    const bloqueio = bloqueioRepository.buscarConflitoEmLista(
        contexto.bloqueios,
        dataHoraInicio,
        dataHoraFim,
        'PAINEL',
    );
    if (bloqueio) {
        throw new AppError(
            `Horário bloqueado pelo barbeiro: ${bloqueio.motivo}.`,
            409,
        );
    }

    const conflito = await contexto.tx.agendamento.findFirst({
        where: {
            status: { not: StatusAgendamento.CANCELADO },
            dataHoraInicio: { lt: dataHoraFim },
            dataHoraFim: { gt: dataHoraInicio },
        },
        select: { clienteId: true },
    });
    if (conflito) {
        throw new AppError(
            conflito.clienteId === contexto.clienteId
                ? 'Você já tem agendamento nesse horário.'
                : 'Já existe um agendamento nesse horário.',
            409,
        );
    }

    return { dataHoraInicio, dataHoraFim };
}

function motivoFalhaLote(
    error: unknown,
):
    | 'conflito_horario'
    | 'fora_funcionamento'
    | 'bloqueio'
    | 'capacidade_pacote' {
    if (!(error instanceof AppError)) {
        return agendamentoRepository.isViolacaoDeSobreposicao(error)
            ? 'conflito_horario'
            : 'conflito_horario';
    }
    if (error.message.startsWith('Horário bloqueado')) {
        return 'bloqueio';
    }
    if (/pacote|usos restantes/i.test(error.message)) {
        return 'capacidade_pacote';
    }
    if (error.statusCode === 422) {
        return 'fora_funcionamento';
    }
    return 'conflito_horario';
}

async function criarLoteComPacoteDoCatalogo(data: LoteAgendamentoData) {
    try {
        return await pacoteClienteRepository.transacionar(
            async (tx) => {
                const clienteExiste =
                    await clienteRepository.bloquearParaCriacaoDePacote(
                        tx,
                        data.clienteId,
                    );
                if (!clienteExiste) {
                    throw new AppError('Cliente não encontrado.', 404);
                }

                const servico = await tx.servico.findUnique({
                    where: { id: data.servicoId },
                });
                if (!servico) {
                    throw new AppError('Serviço não encontrado.', 404);
                }

                const resolvido = await resolverPacoteDoCatalogoNaTransacao(
                    tx,
                    data.clienteId,
                    data.pacoteId!,
                    data.servicoId,
                    true,
                );
                if (data.slots.length > resolvido.capacidade) {
                    throw new AppError(
                        `A quantidade de horários excede a capacidade restante do pacote (${resolvido.capacidade}).`,
                        400,
                    );
                }

                const lote = await loteAgendamentoRepository.criar(
                    {
                        clienteId: data.clienteId,
                        servicoId: data.servicoId,
                        pacoteClienteId: resolvido.pacoteClienteId,
                    },
                    tx,
                );
                const horarios =
                    await horarioFuncionamentoService.carregarConfiguracaoNaTransacao(
                        tx,
                    );
                const bloqueios = await bloqueioRepository.listarTodos(
                    undefined,
                    tx,
                );
                const criados: {
                    agendamentoId: string;
                    data: string;
                    horario: string;
                }[] = [];

                for (const slot of data.slots) {
                    try {
                        const { dataHoraInicio, dataHoraFim } =
                            await validarDisponibilidadeNoLote(slot, servico, {
                                tx,
                                clienteId: data.clienteId,
                                horarios,
                                bloqueios,
                            });
                        const agendamento =
                            await agendamentoRepository.criarComNumeroNoPacoteNaTransacao(
                                tx,
                                {
                                    clienteId: data.clienteId,
                                    servicoId: data.servicoId,
                                    pacoteClienteId: resolvido.pacoteClienteId,
                                    loteId: lote.id,
                                    dataHoraInicio,
                                    dataHoraFim,
                                    status: StatusAgendamento.AGENDADO,
                                },
                                resolvido.pacoteClienteId!,
                                data.servicoId,
                            );
                        criados.push({
                            agendamentoId: agendamento.id,
                            data: slot.data,
                            horario: slot.horario,
                        });
                    } catch (error) {
                        if (
                            !(error instanceof AppError) &&
                            !agendamentoRepository.isViolacaoDeSobreposicao(
                                error,
                            )
                        ) {
                            throw error;
                        }
                        throw new AppError(
                            error instanceof Error
                                ? error.message
                                : 'Erro ao validar disponibilidade do horário.',
                            409,
                            {
                                slot,
                                motivo: motivoFalhaLote(error),
                            },
                        );
                    }
                }

                return {
                    loteId: lote.id,
                    criados,
                    falhados: [],
                    pacoteClienteId: resolvido.pacoteClienteId,
                };
            },
            { timeout: 10_000 },
        );
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

        if (
            data.status === StatusAgendamento.CANCELADO &&
            isAgendamentoConcluido(agendamentoExistente)
        ) {
            throw new AppError(
                'Agendamento concluído não pode ser cancelado.',
                409,
            );
        }

        if (
            data.status === StatusAgendamento.CONCLUIDO &&
            agendamentoExistente.status !== StatusAgendamento.CONCLUIDO
        ) {
            throw new AppError(
                'Para concluir um agendamento use a conclusão de pacote.',
                409,
            );
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
        const dataHoraMudou =
            agendamentoExistente.dataHoraInicio.getTime() !==
            dataHoraInicio.getTime();
        const servicoMudou = agendamentoExistente.servicoId !== data.servicoId;
        const duracaoExistente =
            agendamentoExistente.dataHoraFim.getTime() -
            agendamentoExistente.dataHoraInicio.getTime();
        const duracaoMudou =
            duracaoExistente !== servico.duracaoMinutos * 60 * 1000;
        const extensaoMudou =
            agendamentoExistente.servico.permiteExtensaoFechamento !==
            servico.permiteExtensaoFechamento;
        const regrasDeHorarioMudaram =
            dataHoraMudou || duracaoMudou || extensaoMudou;

        if (regrasDeHorarioMudaram) {
            const horarioValidado = await validarDisponibilidade(
                data.dataHoraInicio,
                servico.duracaoMinutos,
                servico.permiteExtensaoFechamento,
                false,
                data.origem,
                undefined,
                data.permitirForaDoExpediente,
                id,
            );
            dataHoraFim.setTime(horarioValidado.dataHoraFim.getTime());
        }

        if (
            agendamentoExistente.pacoteClienteId &&
            data.status !== StatusAgendamento.CANCELADO &&
            (servicoMudou ||
                agendamentoExistente.status === StatusAgendamento.CANCELADO)
        ) {
            await validarPacoteCliente(
                agendamentoExistente.pacoteClienteId,
                data.servicoId,
            );
        }

        const dados = {
            clienteId: data.clienteId,
            servicoId: data.servicoId,
            dataHoraInicio,
            dataHoraFim,
            status: data.status,
        };
        const agendamentoAtualizado = agendamentoExistente.pacoteClienteId
            ? await agendamentoRepository.atualizarComNumeroNoPacote(
                  id,
                  dados,
                  agendamentoExistente.pacoteClienteId,
                  agendamentoExistente.servicoId,
                  agendamentoExistente.numeroNoPacote ?? null,
                  agendamentoExistente.status,
              )
            : await agendamentoRepository.atualizar(id, dados);

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

        if (isAgendamentoConcluido(agendamento)) {
            throw new AppError(
                'Agendamento concluído não pode ser cancelado.',
                409,
            );
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

    if (agendamento.status === StatusAgendamento.CANCELADO) {
        throw new AppError(
            'Agendamento cancelado não pode ser concluído.',
            409,
        );
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
        agendamento.servicoId,
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
