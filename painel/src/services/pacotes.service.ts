import { apiFetch } from './api.js';
import { ApiError, type ApiErrorBody } from './agendamentos.service.js';
import type { Servico } from './servicos.service.js';

export interface PacoteServicoIncluso {
    pacoteId: string;
    servicoId: string;
    quantidadeTotal: number;
    servico: Servico;
}

export interface Pacote {
    id: string;
    nome: string;
    duracaoDias: number;
    preco: string;
    liberadoParaGemini: boolean;
    createdAt: string;
    arquivadoEm: string | null;
    servicos: PacoteServicoIncluso[];
}

export type PacoteCatalogo = Pacote & { ciclosAtivos: number };

export interface PacotePayload {
    nome: string;
    duracaoDias: number;
    preco: number;
    liberadoParaGemini: boolean;
    servicos: { servicoId: string; quantidade: number }[];
}

async function erroDaResposta(response: Response): Promise<Error> {
    const body = (await response
        .json()
        .catch(() => null)) as ApiErrorBody | null;
    if (!body) {
        return new Error('Erro ao processar requisição.');
    }

    return new ApiError(
        body.message ?? 'Erro ao processar requisição.',
        response.status,
        body,
    );
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        throw await erroDaResposta(response);
    }

    return (await response.json()) as T;
}

export async function listarPacotes(
    situacao: 'ativos' | 'arquivados' | 'todos' = 'ativos',
): Promise<PacoteCatalogo[]> {
    const query =
        situacao === 'ativos'
            ? ''
            : `?${new URLSearchParams({ situacao }).toString()}`;
    const response = await apiFetch(`/api/pacotes${query}`);
    return handleResponse<PacoteCatalogo[]>(response);
}

export async function arquivarPacote(id: string): Promise<PacoteCatalogo> {
    const response = await apiFetch(`/api/pacotes/${id}/arquivar`, {
        method: 'POST',
    });
    return handleResponse<PacoteCatalogo>(response);
}

export async function desarquivarPacote(id: string): Promise<PacoteCatalogo> {
    const response = await apiFetch(`/api/pacotes/${id}/desarquivar`, {
        method: 'POST',
    });
    return handleResponse<PacoteCatalogo>(response);
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
        throw await erroDaResposta(response);
    }
}
