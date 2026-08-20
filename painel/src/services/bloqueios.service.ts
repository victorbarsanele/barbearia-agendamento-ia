import { apiFetch } from './api';

export interface BloqueioHorario {
    id: string;
    dataHoraInicio: string;
    dataHoraFim: string;
    motivo: string;
    createdAt: string;
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new Error(body?.message ?? 'Erro ao processar requisição.');
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return (await response.json()) as T;
}

export async function listarBloqueios(): Promise<BloqueioHorario[]> {
    const response = await apiFetch('/api/bloqueios');
    return handleResponse<BloqueioHorario[]>(response);
}

export async function criarBloqueio(payload: {
    dataHoraInicio: string;
    dataHoraFim: string;
    motivo: string;
}): Promise<BloqueioHorario> {
    const response = await apiFetch('/api/bloqueios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse<BloqueioHorario>(response);
}

export async function excluirBloqueio(id: string): Promise<void> {
    const response = await apiFetch(`/api/bloqueios/${id}`, {
        method: 'DELETE',
    });
    await handleResponse<void>(response);
}
