import { apiFetch } from './api';

export interface Servico {
    id: string;
    nome: string;
    duracaoMinutos: number;
    preco: string | null;
}

export interface ServicoPayload {
    nome: string;
    duracaoMinutos: number;
    preco?: number | null;
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

export async function listarServicos(): Promise<Servico[]> {
    const response = await apiFetch('/api/servicos');
    return handleResponse<Servico[]>(response);
}

export async function buscarServicoPorId(id: string): Promise<Servico> {
    const response = await apiFetch(`/api/servicos/${id}`);
    return handleResponse<Servico>(response);
}

export async function criarServico(payload: ServicoPayload): Promise<Servico> {
    const response = await apiFetch('/api/servicos', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Servico>(response);
}

export async function atualizarServico(
    id: string,
    payload: ServicoPayload,
): Promise<Servico> {
    const response = await apiFetch(`/api/servicos/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Servico>(response);
}

export async function excluirServico(id: string): Promise<void> {
    const response = await apiFetch(`/api/servicos/${id}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }
}
