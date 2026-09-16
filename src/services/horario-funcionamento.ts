import { toZonedTime } from 'date-fns-tz';

export const TIME_ZONE = 'America/Sao_Paulo';
export interface HorarioFuncionamentoConfig {
    diaSemana: number;
    horaAberturaMinutos: number;
    horaFechamentoMinutos: number;
    limiteExtensaoMinutos: number | null;
    ultimoInicioExtensaoMinutos: number | null;
}

export function obterHorarioFuncionamento(
    configuracao: HorarioFuncionamentoConfig[],
    data: Date,
): HorarioFuncionamentoConfig | null {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);
    const dia = dataEmBrasilia.getDay();

    return configuracao.find((item) => item.diaSemana === dia) ?? null;
}

export function ehDiaDeFuncionamento(
    configuracao: HorarioFuncionamentoConfig[],
    data: Date,
): boolean {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);

    return configuracao.some(
        (item) => item.diaSemana === dataEmBrasilia.getDay(),
    );
}

export function estaDentroDoHorarioDeFuncionamento(
    configuracao: HorarioFuncionamentoConfig[],
    data: Date,
): boolean {
    const dataEmBrasilia = toZonedTime(data, TIME_ZONE);

    const horario = obterHorarioFuncionamento(configuracao, data);
    if (!horario) {
        return false;
    }

    const minutos =
        dataEmBrasilia.getHours() * 60 + dataEmBrasilia.getMinutes();

    return (
        minutos >= horario.horaAberturaMinutos &&
        minutos <= horario.horaFechamentoMinutos
    );
}

export function estaDentroDoHorarioDoAgendamento(
    configuracao: HorarioFuncionamentoConfig[],
    inicio: Date,
    fim: Date,
    permiteExtensaoFechamento = false,
): boolean {
    const inicioEmBrasilia = toZonedTime(inicio, TIME_ZONE);
    const fimEmBrasilia = toZonedTime(fim, TIME_ZONE);
    const horario = obterHorarioFuncionamento(configuracao, inicio);

    if (!horario || inicioEmBrasilia.getDay() !== fimEmBrasilia.getDay()) {
        return false;
    }

    const minutosInicio =
        inicioEmBrasilia.getHours() * 60 + inicioEmBrasilia.getMinutes();
    const minutosFim =
        fimEmBrasilia.getHours() * 60 + fimEmBrasilia.getMinutes();
    const limiteFechamento =
        permiteExtensaoFechamento && horario.limiteExtensaoMinutos !== null
            ? horario.limiteExtensaoMinutos
            : horario.horaFechamentoMinutos;
    const limiteInicioExtensao =
        permiteExtensaoFechamento &&
        horario.ultimoInicioExtensaoMinutos !== null
            ? horario.ultimoInicioExtensaoMinutos
            : Number.POSITIVE_INFINITY;

    return (
        minutosInicio >= horario.horaAberturaMinutos &&
        minutosInicio <= limiteInicioExtensao &&
        minutosFim <= limiteFechamento
    );
}
