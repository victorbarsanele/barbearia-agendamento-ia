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

export type StatusReativacaoEnvio =
    | 'PENDENTE'
    | 'ACEITA'
    | 'ENTREGUE'
    | 'FALHOU';

export type MotivoErroReativacao =
    | 'CLIENTE_NAO_ENCONTRADO'
    | 'OPT_OUT'
    | 'COOLDOWN'
    | 'TELEFONE_AUSENTE'
    | 'TELEFONE_INVALIDO'
    | 'NUMERO_IGNORADO'
    | 'FORA_DA_ALLOWLIST'
    | 'FALHA_ENVIO'
    | 'PROVEDOR_SEM_SUPORTE';

export interface ItemClienteInativo {
    clienteId: string;
    nome: string;
    telefone: string;
    ultimaVisita: string;
    diasSemVir: number;
    ultimoServico: string | null;
    totalVisitas: number;
    pacoteAtivoComSaldo: boolean;
    ultimaTentativa: {
        status: StatusReativacaoEnvio;
        criadoEm: string;
    } | null;
    podeReativar: boolean;
    reativacaoBloqueio: 'OPT_OUT' | 'COOLDOWN' | null;
    reativacaoBloqueadaAte: string | null;
}

export interface EnviarReativacaoResultado {
    envioId: string;
    status: 'ACEITA';
}

export class ErroReativacao extends Error {
    readonly status: number;
    readonly motivo: MotivoErroReativacao | null;
    readonly bloqueadoAte: string | null;

    constructor(
        status: number,
        motivo: MotivoErroReativacao | null,
        bloqueadoAte: string | null = null,
    ) {
        super('Falha ao enviar reativação.');
        this.name = 'ErroReativacao';
        this.status = status;
        this.motivo = motivo;
        this.bloqueadoAte = bloqueadoAte;
    }
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

export async function enviarReativacaoWhatsApp(
    clienteId: string,
): Promise<EnviarReativacaoResultado> {
    const response = await apiFetch(
        `/api/clientes/${encodeURIComponent(clienteId)}/reativacao-whatsapp`,
        { method: 'POST' },
    );

    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            motivo?: string;
            bloqueadoAte?: string;
        } | null;
        const motivos: MotivoErroReativacao[] = [
            'CLIENTE_NAO_ENCONTRADO',
            'OPT_OUT',
            'COOLDOWN',
            'TELEFONE_AUSENTE',
            'TELEFONE_INVALIDO',
            'NUMERO_IGNORADO',
            'FORA_DA_ALLOWLIST',
            'FALHA_ENVIO',
            'PROVEDOR_SEM_SUPORTE',
        ];
        const motivo = motivos.includes(body?.motivo as MotivoErroReativacao)
            ? (body?.motivo as MotivoErroReativacao)
            : null;
        throw new ErroReativacao(
            response.status,
            motivo,
            body?.bloqueadoAte ?? null,
        );
    }

    return (await response.json()) as EnviarReativacaoResultado;
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
