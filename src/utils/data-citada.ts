import {
    diaDaSemanaEmBrasilia,
    nomeDiaDaSemana,
    somarDiasAChaveData,
    type DiaDaSemana,
} from './dia-semana';
import {
    ehDiaDeFuncionamento,
    type HorarioFuncionamentoConfig,
} from '../services/horario-funcionamento';

export interface DataCitadaResolvida {
    dataISO: string;
    dataFormatada: string;
    diaDaSemana: string;
    diaDeFuncionamento: boolean;
}

interface ReferenciaData {
    inicio: number;
    fim: number;
    dia: number;
    mes?: number;
    ano?: number;
}

const MESES = new Map<string, number>([
    ['janeiro', 1],
    ['fevereiro', 2],
    ['marco', 3],
    ['abril', 4],
    ['maio', 5],
    ['junho', 6],
    ['julho', 7],
    ['agosto', 8],
    ['setembro', 9],
    ['outubro', 10],
    ['novembro', 11],
    ['dezembro', 12],
]);

function normalizarMes(mes: string): string {
    return mes
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function validarChaveData(chave: string): boolean {
    const match = chave.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return false;
    }

    const ano = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const data = new Date(0);
    data.setUTCHours(0, 0, 0, 0);
    data.setUTCFullYear(ano, mes - 1, dia);

    return (
        data.getUTCFullYear() === ano &&
        data.getUTCMonth() === mes - 1 &&
        data.getUTCDate() === dia
    );
}

function chaveData(ano: number, mes: number, dia: number): string {
    const anoFormatado = String(ano).padStart(4, '0');
    const mesFormatado = String(mes).padStart(2, '0');
    const diaFormatado = String(dia).padStart(2, '0');
    return `${anoFormatado}-${mesFormatado}-${diaFormatado}`;
}

function formatarData(chave: string): string {
    const [ano, mes, dia] = chave.split('-');
    return `${dia}/${mes}/${ano}`;
}

function encontrarDatasNoHorizonte(
    referencia: ReferenciaData,
    hoje: string,
    horizonteAte: string,
    datasNoHorizonte: string[],
): string[] {
    if (referencia.ano !== undefined) {
        const data = chaveData(referencia.ano, referencia.mes!, referencia.dia);
        return validarChaveData(data) && data >= hoje && data <= horizonteAte
            ? [data]
            : [];
    }

    const candidatas = datasNoHorizonte.filter((data) => {
        const [ano, mes, dia] = data.split('-').map(Number);
        return (
            dia === referencia.dia &&
            (referencia.mes === undefined || mes === referencia.mes) &&
            validarChaveData(chaveData(ano, mes, dia))
        );
    });

    return candidatas.length === 1 ? candidatas : [];
}

function criarDatasNoHorizonte(hoje: string, horizonteAte: string): string[] {
    if (
        !validarChaveData(hoje) ||
        !validarChaveData(horizonteAte) ||
        horizonteAte < hoje
    ) {
        return [];
    }

    const datas: string[] = [];
    for (
        let data = hoje;
        data <= horizonteAte;
        data = somarDiasAChaveData(data, 1)
    ) {
        datas.push(data);
    }
    return datas;
}

export function resolverDatasCitadas(
    texto: string,
    hoje: string,
    horizonteAte: string,
    configuracaoFuncionamento: HorarioFuncionamentoConfig[],
): DataCitadaResolvida[] {
    const datasNoHorizonte = criarDatasNoHorizonte(hoje, horizonteAte);
    if (!texto.trim() || datasNoHorizonte.length === 0) {
        return [];
    }

    const referencias: ReferenciaData[] = [];
    const intervalosExplicitos: Array<{ inicio: number; fim: number }> = [];
    const padraoNumerico = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?!\d)/g;
    const padraoMes =
        /\b(?:dia\s+)?(\d{1,2})\s+de\s+(janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?\b/giu;

    for (const match of texto.matchAll(padraoNumerico)) {
        const inicio = match.index ?? 0;
        const fim = inicio + match[0].length;
        const dia = Number(match[1]);
        const mes = Number(match[2]);
        const ano = match[3] === undefined ? undefined : Number(match[3]);
        intervalosExplicitos.push({ inicio, fim });
        referencias.push({
            inicio,
            fim,
            dia,
            mes,
            ...(ano === undefined ? {} : { ano }),
        });
    }

    for (const match of texto.matchAll(padraoMes)) {
        const inicio = match.index ?? 0;
        const fim = inicio + match[0].length;
        const dia = Number(match[1]);
        const mes = MESES.get(normalizarMes(match[2]));
        const ano = match[3] === undefined ? undefined : Number(match[3]);
        intervalosExplicitos.push({ inicio, fim });
        if (mes !== undefined) {
            referencias.push({
                inicio,
                fim,
                dia,
                mes,
                ...(ano === undefined ? {} : { ano }),
            });
        }
    }

    const padraoDia = /\bdia\s+(\d{1,2})\b/giu;
    for (const match of texto.matchAll(padraoDia)) {
        const inicio = match.index ?? 0;
        const fim = inicio + match[0].length;
        if (
            intervalosExplicitos.some(
                (intervalo) => inicio < intervalo.fim && fim > intervalo.inicio,
            )
        ) {
            continue;
        }
        referencias.push({ inicio, fim, dia: Number(match[1]) });
    }

    const resolvidas = new Map<string, DataCitadaResolvida>();
    for (const referencia of referencias.sort((a, b) => a.inicio - b.inicio)) {
        const datas = encontrarDatasNoHorizonte(
            referencia,
            hoje,
            horizonteAte,
            datasNoHorizonte,
        );
        for (const dataISO of datas) {
            const diaDaSemana = diaDaSemanaEmBrasilia(dataISO) as DiaDaSemana;
            const instanteLocal = new Date(`${dataISO}T12:00:00-03:00`);
            resolvidas.set(dataISO, {
                dataISO,
                dataFormatada: formatarData(dataISO),
                diaDaSemana: nomeDiaDaSemana(diaDaSemana),
                diaDeFuncionamento: ehDiaDeFuncionamento(
                    configuracaoFuncionamento,
                    instanteLocal,
                ),
            });
        }
    }

    return [...resolvidas.values()];
}
