import { ApiError, type ApiErrorBody } from './agendamentos.service.js';
import { apiFetch } from './api.js';

export interface ItemRelatorioAtendimentos {
    servicoId: string;
    nome: string;
    quantidade: number;
    quantidadeAvulso: number;
    quantidadePacote: number;
    valorEstimado: string | null;
    semPreco: number;
}

export interface RelatorioAtendimentos {
    periodo: { de: string; ate: string };
    geradoEm: string;
    itens: ItemRelatorioAtendimentos[];
    total: {
        quantidade: number;
        valorEstimado: string | null;
        semPreco: number;
    };
}

async function handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        const body = (await response
            .json()
            .catch(() => null)) as ApiErrorBody | null;
        throw new ApiError(
            body?.message ?? 'Erro ao carregar o relatório.',
            response.status,
            body,
        );
    }

    return (await response.json()) as T;
}

export async function buscarAtendimentos(
    de: string,
    ate: string,
): Promise<RelatorioAtendimentos> {
    const parametros = new URLSearchParams({ de, ate });
    const response = await apiFetch(
        `/api/relatorios/atendimentos?${parametros.toString()}`,
    );
    return handleResponse<RelatorioAtendimentos>(response);
}
