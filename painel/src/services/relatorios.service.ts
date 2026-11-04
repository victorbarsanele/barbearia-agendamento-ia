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

export interface ItemClienteInativo {
    clienteId: string;
    nome: string;
    telefone: string;
    ultimaVisita: string;
    diasSemVir: number;
    ultimoServico: string | null;
    totalVisitas: number;
    pacoteAtivoComSaldo: boolean;
}

export interface RelatorioClientesInativos {
    geradoEm: string;
    filtro: { diasMin: number; diasMax: number };
    total: number;
    truncado: boolean;
    itens: ItemClienteInativo[];
}

export interface ServicoSaldoPacote {
    servicoId: string;
    nome: string;
    total: number;
    restante: number;
    agendados: number;
}

export interface ItemSaldoPacote {
    pacoteClienteId: string;
    clienteId: string;
    nome: string;
    telefone: string;
    pacoteNome: string;
    dataInicio: string;
    ultimaVisita: string | null;
    semVisita: boolean;
    diasSemVir: number;
    temHorarioMarcado: boolean;
    parado: boolean;
    totalRestante: number;
    totalAgendados: number;
    aConcluir: number;
    servicos: ServicoSaldoPacote[];
}

export interface RelatorioSaldoPacotes {
    geradoEm: string;
    filtro: { diasParado: number; somenteParados: boolean };
    totalAtivos: number;
    totalParados: number;
    total: number;
    truncado: boolean;
    itens: ItemSaldoPacote[];
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

export async function buscarClientesInativos(
    diasMin: number,
    diasMax: number,
): Promise<RelatorioClientesInativos> {
    const parametros = new URLSearchParams({
        diasMin: String(diasMin),
        diasMax: String(diasMax),
    });
    const response = await apiFetch(
        `/api/relatorios/clientes-inativos?${parametros.toString()}`,
    );
    return handleResponse<RelatorioClientesInativos>(response);
}

export async function buscarSaldoPacotes(
    diasParado: number,
    somenteParados: boolean,
): Promise<RelatorioSaldoPacotes> {
    const parametros = new URLSearchParams({
        diasParado: String(diasParado),
        somenteParados: String(somenteParados),
    });
    const response = await apiFetch(
        `/api/relatorios/saldo-pacotes?${parametros.toString()}`,
    );
    return handleResponse<RelatorioSaldoPacotes>(response);
}
