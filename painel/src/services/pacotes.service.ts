import { apiFetch } from './api';
import type { Servico } from './servicos.service';

export interface PacoteServicoIncluso {
    pacoteId: string;
    servicoId: string;
    servico: Servico;
}

export interface Pacote {
    id: string;
    nome: string;
    duracaoDias: number;
    quantidade: number;
    createdAt: string;
    servicos: PacoteServicoIncluso[];
}

export interface PacotePayload {
    nome: string;
    duracaoDias: number;
    quantidade: number;
    servicoIds: string[];
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

export async function listarPacotes(): Promise<Pacote[]> {
    const response = await apiFetch('/api/pacotes');
    return handleResponse<Pacote[]>(response);
}

export async function buscarPacotePorId(id: string): Promise<Pacote> {
    const response = await apiFetch(`/api/pacotes/${id}`);
    return handleResponse<Pacote>(response);
}

export async function criarPacote(payload: PacotePayload): Promise<Pacote> {
    const response = await apiFetch('/api/pacotes', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Pacote>(response);
}

export async function atualizarPacote(
    id: string,
    payload: PacotePayload,
): Promise<Pacote> {
    const response = await apiFetch(`/api/pacotes/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<Pacote>(response);
}

export async function excluirPacote(id: string): Promise<void> {
    const response = await apiFetch(`/api/pacotes/${id}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }
}
