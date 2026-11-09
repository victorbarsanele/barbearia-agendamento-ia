import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { TIME_ZONE } from '../services/horario-funcionamento';

export interface AutoConclusaoConfig {
    enabled: boolean;
    aPartirDe: Date | null;
    horaLocal: number;
    intervaloMs: number;
    loteMaximo: number;
    janelaEstornoHoras: number;
}

function lerInteiro(
    nome: string,
    padrao: number,
    minimo: number,
    maximo: number,
): number {
    const recebido = process.env[nome];
    if (recebido === undefined) return padrao;

    const valor = recebido.trim();
    const numero = Number(valor);
    if (
        !/^\d+$/.test(valor) ||
        !Number.isInteger(numero) ||
        numero < minimo ||
        numero > maximo
    ) {
        throw new Error(
            `${nome} inválida: informe inteiro entre ${minimo} e ${maximo}.`,
        );
    }
    return numero;
}

function lerDataInicial(): Date {
    const valor = process.env.AUTO_CONCLUSAO_A_PARTIR_DE?.trim();
    if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        throw new Error(
            'AUTO_CONCLUSAO_A_PARTIR_DE inválida ou ausente: informe data local no formato YYYY-MM-DD.',
        );
    }

    const dataUtc = new Date(`${valor}T00:00:00.000Z`);
    if (
        Number.isNaN(dataUtc.getTime()) ||
        dataUtc.toISOString().slice(0, 10) !== valor
    ) {
        throw new Error(
            'AUTO_CONCLUSAO_A_PARTIR_DE inválida: informe data válida no formato YYYY-MM-DD.',
        );
    }

    return fromZonedTime(`${valor}T00:00:00`, TIME_ZONE);
}

export function getAutoConclusaoConfig(): AutoConclusaoConfig {
    const flag = process.env.AUTO_CONCLUSAO_ENABLED;
    if (flag !== undefined && flag !== 'true' && flag !== 'false') {
        throw new Error('AUTO_CONCLUSAO_ENABLED inválida: use true ou false.');
    }
    const enabled = flag === 'true';

    return {
        enabled,
        aPartirDe: enabled ? lerDataInicial() : null,
        horaLocal: lerInteiro('AUTO_CONCLUSAO_HORA_LOCAL', 6, 0, 23),
        intervaloMs: lerInteiro(
            'AUTO_CONCLUSAO_INTERVALO_MS',
            15 * 60 * 1000,
            1000,
            24 * 60 * 60 * 1000,
        ),
        loteMaximo: lerInteiro('AUTO_CONCLUSAO_LOTE_MAXIMO', 50, 1, 500),
        janelaEstornoHoras: lerInteiro('JANELA_ESTORNO_HORAS', 48, 1, 720),
    };
}

export function validarAutoConclusaoConfig(): void {
    getAutoConclusaoConfig();
}

export function calcularCorteAutoConclusao(
    agora: Date,
    horaLocal: number,
): Date {
    const local = toZonedTime(agora, TIME_ZONE);
    if (local.getHours() < horaLocal) {
        local.setDate(local.getDate() - 1);
    }
    local.setHours(0, 0, 0, 0);
    return fromZonedTime(local, TIME_ZONE);
}

export function estaDentroDaJanelaEstorno(
    concluidoEm: Date | null,
    agora: Date,
    janelaEstornoHoras: number,
): boolean {
    if (!concluidoEm) return false;
    const idadeMs = agora.getTime() - concluidoEm.getTime();
    return idadeMs >= 0 && idadeMs <= janelaEstornoHoras * 60 * 60 * 1000;
}
