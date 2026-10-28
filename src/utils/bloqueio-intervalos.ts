import type { BloqueioHorario } from '@prisma/client';
import { fromZonedTime, formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { diaDaSemanaEmBrasilia, somarDiasAChaveData } from './dia-semana';

const TIME_ZONE = 'America/Sao_Paulo';

type BloqueioIntervalo = Pick<
    BloqueioHorario,
    | 'dataHoraInicio'
    | 'dataHoraFim'
    | 'escopo'
    | 'recorrencia'
    | 'diaSemana'
    | 'horaInicioMinutos'
    | 'horaFimMinutos'
>;

export interface IntervaloBloqueioNoDia {
    inicioMin: number;
    fimMin: number;
}

function minutosEmBrasilia(instante: Date): number {
    const dataLocal = toZonedTime(instante, TIME_ZONE);
    return dataLocal.getHours() * 60 + dataLocal.getMinutes();
}

export function intervalosBloqueioNoDia(
    dataLocal: string,
    bloqueios: readonly BloqueioIntervalo[],
): IntervaloBloqueioNoDia[] {
    const inicioDia = fromZonedTime(`${dataLocal}T00:00:00`, TIME_ZONE);
    const proximaData = somarDiasAChaveData(dataLocal, 1);
    const fimDia = fromZonedTime(`${proximaData}T00:00:00`, TIME_ZONE);
    const diaSemana = diaDaSemanaEmBrasilia(dataLocal);

    return bloqueios
        .flatMap((bloqueio) => {
            if (bloqueio.recorrencia === 'SEMANAL') {
                if (
                    bloqueio.diaSemana !== DIAS_SEMANA_INDEX[diaSemana] ||
                    bloqueio.horaInicioMinutos === null ||
                    bloqueio.horaFimMinutos === null
                ) {
                    return [];
                }

                return [
                    {
                        inicioMin: bloqueio.horaInicioMinutos,
                        fimMin: bloqueio.horaFimMinutos,
                    },
                ];
            }

            if (
                bloqueio.dataHoraInicio === null ||
                bloqueio.dataHoraFim === null ||
                bloqueio.dataHoraInicio >= fimDia ||
                bloqueio.dataHoraFim <= inicioDia
            ) {
                return [];
            }

            return [
                {
                    inicioMin:
                        formatInTimeZone(
                            bloqueio.dataHoraInicio,
                            TIME_ZONE,
                            'yyyy-MM-dd',
                        ) === dataLocal
                            ? minutosEmBrasilia(bloqueio.dataHoraInicio)
                            : 0,
                    fimMin:
                        formatInTimeZone(
                            bloqueio.dataHoraFim,
                            TIME_ZONE,
                            'yyyy-MM-dd',
                        ) === dataLocal
                            ? minutosEmBrasilia(bloqueio.dataHoraFim)
                            : 24 * 60,
                },
            ];
        })
        .sort(
            (primeiro, segundo) =>
                primeiro.inicioMin - segundo.inicioMin ||
                primeiro.fimMin - segundo.fimMin,
        );
}

const DIAS_SEMANA_INDEX = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
} as const;
