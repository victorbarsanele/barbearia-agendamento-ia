import { apiFetch } from './api';

export type StatusAgendamento =
    | 'AGENDADO'
    | 'CONFIRMADO'
    | 'CANCELADO'
    | 'CONCLUIDO';

export interface Agendamento {
    id: string;
    dataHoraInicio: string;
    dataHoraFim: string;
    status: StatusAgendamento;
    pacoteClienteId: string | null;
    loteId: string | null;
    concluido: boolean;
    cliente: {
        id: string;
        nome: string;
        telefone: string;
    };
    servico: {
        id: string;
        nome: string;
        duracaoMinutos: number;
        preco: string;
    };
}

export interface CriarAgendamentoPayload {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    dataHoraInicio: string;
    registroRetroativo?: boolean;
}

export interface AtualizarAgendamentoPayload {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
    status: StatusAgendamento;
    notificarCliente?: boolean;
}

export interface CancelarAgendamentoPayload {
    notificarCliente?: boolean;
    aplicarParaLote?: boolean;
}

export interface SlotLote {
    data: string;
    horario: string;
}

export interface SimularLotePayload {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    slots: SlotLote[];
}

export interface SimularLoteResultado {
    disponiveis: SlotLote[];
    conflitos: (SlotLote & { motivo: string })[];
}

export interface CriarLoteResultado {
    loteId: string;
    criados: { agendamentoId: string; data: string; horario: string }[];
    falhados: (SlotLote & { motivo: string })[];
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }

    return (await response.json()) as T;
}

export async function listarAgendamentos(): Promise<Agendamento[]> {
    const response = await apiFetch('/api/agendamentos');
    return handleResponse<Agendamento[]>(response);
}

export async function buscarAgendamentoPorId(id: string): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}`);
    return handleResponse<Agendamento>(response);
}

export async function cancelarAgendamento(
    id: string,
    payload: CancelarAgendamentoPayload = {},
): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Agendamento>(response);
}

export async function excluirAgendamento(id: string): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
    });

    return handleResponse<Agendamento>(response);
}

export async function criarAgendamento(
    payload: CriarAgendamentoPayload,
): Promise<Agendamento> {
    const response = await apiFetch('/api/agendamentos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Agendamento>(response);
}

export async function atualizarAgendamento(
    id: string,
    payload: AtualizarAgendamentoPayload,
): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Agendamento>(response);
}

export async function concluirAgendamento(
    id: string,
    aplicarParaLote = false,
): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}/concluir`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aplicarParaLote }),
    });

    return handleResponse<Agendamento>(response);
}

export async function vincularPacoteAgendamento(
    id: string,
    pacoteClienteId: string,
): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}/pacote`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pacoteClienteId }),
    });

    return handleResponse<Agendamento>(response);
}

export async function desvincularPacoteAgendamento(
    id: string,
): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}/pacote`, {
        method: 'DELETE',
    });

    return handleResponse<Agendamento>(response);
}

export async function simularLoteAgendamentos(
    payload: SimularLotePayload,
): Promise<SimularLoteResultado> {
    const response = await apiFetch('/api/agendamentos/lote/simular', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<SimularLoteResultado>(response);
}

export async function criarLoteAgendamentos(
    payload: SimularLotePayload,
): Promise<CriarLoteResultado> {
    const response = await apiFetch('/api/agendamentos/lote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<CriarLoteResultado>(response);
}
