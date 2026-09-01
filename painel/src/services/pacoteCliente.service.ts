import { apiFetch } from './api';
import type { Pacote } from './pacotes.service';

export interface PacoteClienteAtivo {
    id: string;
    clienteId: string;
    pacoteId: string;
    quantidadeTotal: number;
    quantidadeRestante: number;
    dataInicio: string;
    status: 'ATIVO' | 'FINALIZADO' | 'CANCELADO';
    createdAt: string;
    pacote: Pacote;
}

export interface VincularPacotePayload {
    clienteId: string;
    pacoteId: string;
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

export async function buscarPacoteAtivoDoCliente(
    clienteId: string,
): Promise<PacoteClienteAtivo | null> {
    const response = await apiFetch(`/api/pacotes/cliente/${clienteId}`);
    return handleResponse<PacoteClienteAtivo | null>(response);
}

export async function vincularPacoteCliente(
    payload: VincularPacotePayload,
): Promise<PacoteClienteAtivo> {
    const response = await apiFetch('/api/pacotes/vincular', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    return handleResponse<PacoteClienteAtivo>(response);
}

export async function desvincularPacoteCliente(
    pacoteClienteId: string,
): Promise<PacoteClienteAtivo> {
    const response = await apiFetch(
        `/api/pacotes/cliente/${pacoteClienteId}/desvincular`,
        { method: 'PATCH' },
    );

    return handleResponse<PacoteClienteAtivo>(response);
}
