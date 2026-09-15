import { toZonedTime } from 'date-fns-tz';

export const TIME_ZONE = 'America/Sao_Paulo';
export const HORA_ABERTURA = 9;
export const HORA_FECHAMENTO = 19;
export const HORA_ABERTURA_SABADO = 8;
export const HORA_FECHAMENTO_SEMANA = 20;
export const HORA_FECHAMENTO_SABADO = 17;
export const HORA_ULTIMO_INICIO_EXTENSAO = 19 * 60 + 30;
export const DIAS_FUNCIONAMENTO = [1, 2, 3, 4, 5, 6] as const;

export function obterHorarioFuncionamento(data: Date): {
    abertura: number;
    fechamento: number;
} | null {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);
    const dia = dataEmBrasilia.getDay();

    if (dia === 0) {
        return null;
    }

    return {
        abertura: dia === 6 ? HORA_ABERTURA_SABADO : HORA_ABERTURA,
        fechamento: dia === 6 ? HORA_FECHAMENTO_SABADO : HORA_FECHAMENTO_SEMANA,
    };
}

export function ehDiaDeFuncionamento(data: Date): boolean {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);

    return DIAS_FUNCIONAMENTO.includes(
        dataEmBrasilia.getDay() as (typeof DIAS_FUNCIONAMENTO)[number],
    );
}

export function estaDentroDoHorarioDeFuncionamento(data: Date): boolean {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);

    const horario = obterHorarioFuncionamento(data);
    if (!horario) {
        return false;
    }

    const minutos =
        dataEmBrasilia.getHours() * 60 + dataEmBrasilia.getMinutes();

    return (
        minutos >= horario.abertura * 60 && minutos <= horario.fechamento * 60
    );
}

export function estaDentroDoHorarioDoAgendamento(
    inicio: Date,
    fim: Date,
    permiteExtensaoFechamento = false,
): boolean {
    const inicioEmBrasilia = toZonedTime(inicio, TIME_ZONE);
    const fimEmBrasilia = toZonedTime(fim, TIME_ZONE);
    const horario = obterHorarioFuncionamento(inicio);

    if (!horario || inicioEmBrasilia.getDay() !== fimEmBrasilia.getDay()) {
        return false;
    }

    const minutosInicio =
        inicioEmBrasilia.getHours() * 60 + inicioEmBrasilia.getMinutes();
    const minutosFim =
        fimEmBrasilia.getHours() * 60 + fimEmBrasilia.getMinutes();
    const ehQuintaOuSexta = [4, 5].includes(inicioEmBrasilia.getDay());
    const limiteFechamento =
        horario.fechamento * 60 +
        (permiteExtensaoFechamento && ehQuintaOuSexta ? 30 : 0);
    const limiteInicioExtensao =
        permiteExtensaoFechamento && ehQuintaOuSexta
            ? HORA_ULTIMO_INICIO_EXTENSAO
            : Number.POSITIVE_INFINITY;

    return (
        minutosInicio >= horario.abertura * 60 &&
        minutosInicio <= limiteInicioExtensao &&
        minutosFim <= limiteFechamento
    );
}
