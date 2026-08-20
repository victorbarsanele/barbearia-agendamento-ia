import { toZonedTime } from 'date-fns-tz';

export const TIME_ZONE = 'America/Sao_Paulo';
export const HORA_ABERTURA = 9;
export const HORA_FECHAMENTO = 19;
export const DIAS_FUNCIONAMENTO = [1, 2, 3, 4, 5, 6] as const;

export function ehDiaDeFuncionamento(data: Date): boolean {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);

    return DIAS_FUNCIONAMENTO.includes(
        dataEmBrasilia.getDay() as (typeof DIAS_FUNCIONAMENTO)[number],
    );
}

export function estaDentroDoHorarioDeFuncionamento(data: Date): boolean {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);

    if (!ehDiaDeFuncionamento(data)) {
        return false;
    }

    const minutos =
        dataEmBrasilia.getHours() * 60 + dataEmBrasilia.getMinutes();

    return minutos >= HORA_ABERTURA * 60 && minutos <= HORA_FECHAMENTO * 60;
}
