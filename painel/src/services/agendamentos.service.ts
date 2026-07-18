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
    dataHoraInicio: string;
}

export interface AtualizarAgendamentoPayload {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
    status: StatusAgendamento;
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

export async function cancelarAgendamento(id: string): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}`, {
        method: 'DELETE',
    });

    return handleResponse<Agendamento>(response);
}

export async function excluirAgendamento(id: string): Promise<Agendamento> {
    const response = await apiFetch(`/api/agendamentos/${id}`, {
        method: 'DELETE',
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
