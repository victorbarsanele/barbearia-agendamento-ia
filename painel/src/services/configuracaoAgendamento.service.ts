import { apiFetch } from './api';
import { ApiError, type ApiErrorBody } from './agendamentos.service.js';

export interface ConfiguracaoAgendamento {
    minAntecedenciaMinutos: number;
    horizonteDias: number | null;
    limiteAte: string | null;
    horizontePadraoDias: number;
    horizonteEfetivo: string;
    limiteAtivo: boolean;
}

export interface SalvarHorizonteAgendaPayload {
    horizonteDias: number | null;
    limiteAte: string | null;
}

async function handleResponse(
    response: Response,
    mensagemPadrao: string,
): Promise<ConfiguracaoAgendamento> {
    if (!response.ok) {
        const body = (await response
            .json()
            .catch(() => null)) as ApiErrorBody | null;
        throw new ApiError(
            body?.message ?? mensagemPadrao,
            response.status,
            body,
        );
    }

    return (await response.json()) as ConfiguracaoAgendamento;
}

export async function buscarConfiguracaoAgendamento(): Promise<ConfiguracaoAgendamento> {
    const response = await apiFetch('/api/configuracao-agendamento');
    return handleResponse(
        response,
        'Não foi possível carregar a configuração de agendamento.',
    );
}

export async function salvarHorizonteAgenda(
    payload: SalvarHorizonteAgendaPayload,
): Promise<ConfiguracaoAgendamento> {
    const response = await apiFetch('/api/configuracao-agendamento/horizonte', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return handleResponse(
        response,
        'Não foi possível salvar o horizonte da agenda.',
    );
}
