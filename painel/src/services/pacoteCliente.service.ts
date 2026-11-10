import { apiFetch } from './api.js';
import { ApiError, type ApiErrorBody } from './agendamentos.service.js';
import type { Pacote } from './pacotes.service.js';

export interface PacoteClienteAtivo {
    id: string;
    clienteId: string;
    pacoteId: string;
    dataInicio: string;
    renovadoEm: string | null;
    status: 'ATIVO' | 'FINALIZADO' | 'CANCELADO';
    createdAt: string;
    pacote: Pacote;
    servicos: PacoteClienteServicoSaldo[];
}

export interface PacoteClienteServicoSaldo {
    id: string;
    pacoteClienteId: string;
    servicoId: string;
    quantidadeTotal: number;
    quantidadeRestante: number;
    usosAnteriores: number;
    servico: PacoteClienteAtivo['pacote']['servicos'][number]['servico'];
}

export interface VincularPacotePayload {
    clienteId: string;
    pacoteId: string;
    usosAnteriores?: { servicoId: string; usosAnteriores: number }[];
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response
            .json()
            .catch(() => null)) as ApiErrorBody | null;
        if (!body) {
            throw new Error('Erro ao processar requisição.');
        }

        throw new ApiError(
            body.message ?? 'Erro ao processar requisição.',
            response.status,
            body,
        );
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

export async function atualizarUsosAnteriores(
    pacoteClienteId: string,
    servicoId: string,
    usosAnteriores: number,
): Promise<PacoteClienteAtivo> {
    const response = await apiFetch(
        `/api/pacotes/cliente/${pacoteClienteId}/servicos/${servicoId}/usos-anteriores`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ usosAnteriores }),
        },
    );

    return handleResponse<PacoteClienteAtivo>(response);
}
