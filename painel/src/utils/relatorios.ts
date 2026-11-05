import { getBrazilDateKey } from './dateTime.js';
import { neutralizarFormulaCsv, serializarCsv } from './csv.js';
import type {
    OrigemRelatorioAgendamentos,
    RelatorioOrigemAgendamentos,
} from '../services/relatorios.service.js';

export type AtalhoPeriodo = 'este-mes' | 'mes-passado' | 'ultimos-30-dias';

export interface PeriodoRelatorio {
    de: string;
    ate: string;
}

export interface LinhaCsvAtendimentos {
    nome: string;
    quantidade: number;
    quantidadeAvulso: number;
    quantidadePacote: number;
    valorEstimado: string | null;
    semPreco: number;
}

export interface DadosCsvAtendimentos {
    periodo: PeriodoRelatorio;
    itens: LinhaCsvAtendimentos[];
    total: {
        quantidade: number;
        valorEstimado: string | null;
        semPreco: number;
    };
}

export function formatarDataRelatorio(data: string): string {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
    if (!partes) return data;

    const ano = Number(partes[1]);
    const mes = Number(partes[2]);
    const dia = Number(partes[3]);
    const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
    const diasNoMes = [
        31,
        bissexto ? 29 : 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];

    if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes[mes - 1]) {
        return data;
    }

    return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

function parseDateKey(chave: string): [number, number, number] | null {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chave);
    if (!partes) return null;

    const ano = Number(partes[1]);
    const mes = Number(partes[2]);
    const dia = Number(partes[3]);
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();

    if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes) {
        return null;
    }

    return [ano, mes, dia];
}

function formatDateKey(ano: number, mes: number, dia: number): string {
    return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function somarDiasCalendario(chave: string, dias: number): string {
    const partes = parseDateKey(chave);
    if (!partes) throw new RangeError('Data local inválida.');

    const data = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
    data.setUTCDate(data.getUTCDate() + dias);
    return formatDateKey(
        data.getUTCFullYear(),
        data.getUTCMonth() + 1,
        data.getUTCDate(),
    );
}

function ordinalCalendario(chave: string): number | null {
    const partes = parseDateKey(chave);
    if (!partes) return null;

    const [ano, mes, dia] = partes;
    const anoAnterior = ano - 1;
    let dias =
        anoAnterior * 365 +
        Math.floor(anoAnterior / 4) -
        Math.floor(anoAnterior / 100) +
        Math.floor(anoAnterior / 400);

    for (let mesAnterior = 1; mesAnterior < mes; mesAnterior += 1) {
        dias += new Date(Date.UTC(ano, mesAnterior, 0)).getUTCDate();
    }

    return dias + dia;
}

export function calcularPeriodoAtalho(
    atalho: AtalhoPeriodo,
    hoje: Date | string,
): PeriodoRelatorio {
    const hojeChave = hoje instanceof Date ? getBrazilDateKey(hoje) : hoje;
    const partes = parseDateKey(hojeChave);
    if (!partes) throw new RangeError('Data local inválida.');

    const [ano, mes] = partes;
    const primeiroDiaMes = formatDateKey(ano, mes, 1);

    switch (atalho) {
        case 'este-mes':
            return { de: primeiroDiaMes, ate: hojeChave };
        case 'mes-passado': {
            const primeiroDiaMesPassado = somarDiasCalendario(
                primeiroDiaMes,
                -1,
            ).replace(/-\d{2}$/, '-01');
            return {
                de: primeiroDiaMesPassado,
                ate: somarDiasCalendario(primeiroDiaMes, -1),
            };
        }
        case 'ultimos-30-dias':
            return {
                de: somarDiasCalendario(hojeChave, -29),
                ate: hojeChave,
            };
    }
}

export function validarIntervaloRelatorio(
    de: string,
    ate: string,
): string | null {
    if (!de || !ate) return 'Informe as datas inicial e final.';

    const inicioOrdinal = ordinalCalendario(de);
    const fimOrdinal = ordinalCalendario(ate);
    if (inicioOrdinal === null || fimOrdinal === null) {
        return 'Informe datas válidas.';
    }
    if (inicioOrdinal > fimOrdinal) {
        return 'A data inicial deve ser anterior ou igual à data final.';
    }
    if (fimOrdinal - inicioOrdinal + 1 > 366) {
        return 'O período não pode ultrapassar 366 dias.';
    }

    return null;
}

export function montarCsvAtendimentos(dados: DadosCsvAtendimentos): string {
    const linhas: (string | number | null)[][] = [
        [
            'Serviço',
            'Atendimentos',
            'Avulso',
            'Pacote',
            'Valor estimado (R$)',
            'Sem preço',
        ],
        ...dados.itens.map((item) => [
            neutralizarFormulaCsv(item.nome),
            item.quantidade,
            item.quantidadeAvulso,
            item.quantidadePacote,
            item.valorEstimado?.replace('.', ',') ?? null,
            item.semPreco,
        ]),
        [
            'TOTAL',
            dados.total.quantidade,
            dados.itens.reduce((soma, item) => soma + item.quantidadeAvulso, 0),
            dados.itens.reduce((soma, item) => soma + item.quantidadePacote, 0),
            dados.total.valorEstimado?.replace('.', ',') ?? null,
            dados.total.semPreco,
        ],
    ];

    return serializarCsv(linhas);
}

export function formatarValorEstimado(valor: string | null): string {
    if (valor === null) return '—';

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(Number(valor));
}

export function nomeArquivoCsvAtendimentos(periodo: PeriodoRelatorio): string {
    return `atendimentos_${periodo.de}_a_${periodo.ate}.csv`;
}

export function rotuloOrigemRelatorio(
    origem: OrigemRelatorioAgendamentos,
): string {
    switch (origem) {
        case 'WHATSAPP_IA':
            return 'WhatsApp (IA)';
        case 'PAINEL':
            return 'Painel';
        case 'NAO_INFORMADO':
            return 'Não informado';
    }
}

export function formatarPercentualOrigem(percentual: number): string {
    return `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    }).format(percentual)}%`;
}

export function montarCsvOrigemAgendamentos(
    relatorio: RelatorioOrigemAgendamentos,
): string {
    const totalCriados = relatorio.origens.reduce(
        (soma, item) => soma + item.total,
        0,
    );
    const totalAtivos = relatorio.origens.reduce(
        (soma, item) => soma + item.ativos,
        0,
    );
    const totalCancelados = relatorio.origens.reduce(
        (soma, item) => soma + item.cancelados,
        0,
    );
    const linhas: (string | number)[][] = [
        ['Origem', 'Criados', 'Ativos', 'Cancelados', '% do total'],
        ...relatorio.origens.map((item) => [
            neutralizarFormulaCsv(rotuloOrigemRelatorio(item.origem)),
            item.total,
            item.ativos,
            item.cancelados,
            formatarPercentualOrigem(item.percentual),
        ]),
        [
            'TOTAL',
            totalCriados,
            totalAtivos,
            totalCancelados,
            formatarPercentualOrigem(totalCriados > 0 ? 100 : 0),
        ],
    ];

    return serializarCsv(linhas);
}

export function nomeArquivoCsvOrigemAgendamentos(
    periodo: PeriodoRelatorio,
): string {
    return `origem_agendamentos_${periodo.de}_a_${periodo.ate}.csv`;
}
