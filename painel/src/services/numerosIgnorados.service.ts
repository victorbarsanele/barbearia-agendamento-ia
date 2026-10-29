import { ApiError, type ApiErrorBody } from './agendamentos.service.js';
import { apiFetch } from './api.js';

export interface NumeroIgnorado {
    id: string;
    telefone: string;
    rotulo: string;
    criadoEm: string;
}

export interface CriarNumeroIgnoradoPayload {
    telefone: string;
    rotulo: string;
    confirmarMesmoSendoCliente?: boolean;
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response
            .json()
            .catch(() => null)) as ApiErrorBody | null;
        throw new ApiError(
            body?.message ?? 'Erro ao processar requisição.',
            response.status,
            body,
        );
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

export async function listarNumerosIgnorados(): Promise<NumeroIgnorado[]> {
    const response = await apiFetch('/api/numeros-ignorados');
    return handleResponse<NumeroIgnorado[]>(response);
}

export async function criarNumeroIgnorado(
    payload: CriarNumeroIgnoradoPayload,
): Promise<NumeroIgnorado> {
    const response = await apiFetch('/api/numeros-ignorados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<NumeroIgnorado>(response);
}

export async function excluirNumeroIgnorado(id: string): Promise<void> {
    const response = await apiFetch(
        `/api/numeros-ignorados/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
    );
    return handleResponse<void>(response);
}
