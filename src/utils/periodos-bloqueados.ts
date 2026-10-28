import type { IntervaloBloqueioNoDia } from './bloqueio-intervalos';
import { intervalosBloqueioNoDia } from './bloqueio-intervalos';
import { fromZonedTime } from 'date-fns-tz';
import {
    DIAS_SEMANA,
    diaDaSemanaEmBrasilia,
    somarDiasAChaveData,
} from './dia-semana';
import {
    ehDiaDeFuncionamento,
    obterHorarioFuncionamento,
    type HorarioFuncionamentoConfig,
} from '../services/horario-funcionamento';

const TIME_ZONE = 'America/Sao_Paulo';
const LIMITE_DIAS_RETORNO = 60;

type BloqueioIntervalo = readonly (Parameters<
    typeof intervalosBloqueioNoDia
>[1][number] & {
    motivo?: string | null;
})[];

interface PeriodoAberto {
    inicioMin: number;
    fimMin: number;
}

export interface PeriodoBloqueado {
    inicio: string;
    fim: string;
    retornoEm: string | null;
    motivos: string[];
}

function obterPeriodosAbertos(
    dataLocal: string,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
): PeriodoAberto[] {
    const data = fromZonedTime(`${dataLocal}T12:00:00`, TIME_ZONE);
    if (!ehDiaDeFuncionamento(horarioFuncionamento, data)) {
        return [];
    }

    const horario = obterHorarioFuncionamento(horarioFuncionamento, data);
    if (!horario) {
        return [];
    }

    const periodos =
        horario.almocoInicioMinutos !== null &&
        horario.almocoFimMinutos !== null
            ? [
                  {
                      inicioMin: horario.horaAberturaMinutos,
                      fimMin: horario.almocoInicioMinutos,
                  },
                  {
                      inicioMin: horario.almocoFimMinutos,
                      fimMin: horario.horaFechamentoMinutos,
                  },
              ]
            : [
                  {
                      inicioMin: horario.horaAberturaMinutos,
                      fimMin: horario.horaFechamentoMinutos,
                  },
              ];

    return periodos.filter((periodo) => periodo.inicioMin < periodo.fimMin);
}

function periodoEstaCoberto(
    periodo: PeriodoAberto,
    intervalos: IntervaloBloqueioNoDia[],
): boolean {
    let cobertoAte = periodo.inicioMin;

    for (const intervalo of intervalos) {
        if (intervalo.fimMin <= cobertoAte) {
            continue;
        }
        if (intervalo.inicioMin > cobertoAte) {
            return false;
        }

        cobertoAte = Math.max(cobertoAte, intervalo.fimMin);
        if (cobertoAte >= periodo.fimMin) {
            return true;
        }
    }

    return false;
}

function primeiroDiaAbertoSemBloqueio(
    dataInicial: string,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
    bloqueios: BloqueioIntervalo,
    limiteDias: number,
): string | null {
    for (let deslocamento = 0; deslocamento < limiteDias; deslocamento += 1) {
        const data = somarDiasAChaveData(dataInicial, deslocamento);
        if (
            obterPeriodosAbertos(data, horarioFuncionamento).length > 0 &&
            !diaTotalmenteBloqueado(data, horarioFuncionamento, bloqueios)
        ) {
            return data;
        }
    }

    return null;
}

function bloqueioIntersectaExpedienteNoPeriodo(
    inicio: string,
    fim: string,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
    bloqueio: BloqueioIntervalo[number],
): boolean {
    for (let data = inicio; data <= fim; data = somarDiasAChaveData(data, 1)) {
        const periodosAbertos = obterPeriodosAbertos(
            data,
            horarioFuncionamento,
        );
        const intervalos = intervalosBloqueioNoDia(data, [bloqueio]);

        if (
            periodosAbertos.some((periodo) =>
                intervalos.some(
                    (intervalo) =>
                        intervalo.inicioMin < periodo.fimMin &&
                        intervalo.fimMin > periodo.inicioMin,
                ),
            )
        ) {
            return true;
        }
    }

    return false;
}

function inicioOrdenacaoBloqueio(
    dataInicial: string,
    dataFinal: string,
    bloqueio: BloqueioIntervalo[number],
): number {
    if (bloqueio.recorrencia === 'PONTUAL') {
        return bloqueio.dataHoraInicio?.getTime() ?? Number.POSITIVE_INFINITY;
    }

    if (bloqueio.diaSemana === null || bloqueio.horaInicioMinutos === null) {
        return Number.POSITIVE_INFINITY;
    }

    for (
        let data = dataInicial;
        data <= dataFinal;
        data = somarDiasAChaveData(data, 1)
    ) {
        if (
            DIAS_SEMANA.indexOf(diaDaSemanaEmBrasilia(data)) ===
            bloqueio.diaSemana
        ) {
            const hora = String(
                Math.floor(bloqueio.horaInicioMinutos / 60),
            ).padStart(2, '0');
            const minuto = String(bloqueio.horaInicioMinutos % 60).padStart(
                2,
                '0',
            );
            return fromZonedTime(
                `${data}T${hora}:${minuto}:00`,
                TIME_ZONE,
            ).getTime();
        }
    }

    return Number.POSITIVE_INFINITY;
}

function motivosDoPeriodo(
    inicio: string,
    fim: string,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
    bloqueios: BloqueioIntervalo,
): string[] {
    const ordenados = bloqueios
        .map((bloqueio, indice) => ({
            bloqueio,
            indice,
            motivo: bloqueio.motivo?.trim() ?? '',
            inicio: inicioOrdenacaoBloqueio(inicio, fim, bloqueio),
        }))
        .filter(
            ({ bloqueio, motivo }) =>
                bloqueio.escopo !== 'SO_PAINEL' &&
                motivo.length > 0 &&
                bloqueioIntersectaExpedienteNoPeriodo(
                    inicio,
                    fim,
                    horarioFuncionamento,
                    bloqueio,
                ),
        )
        .sort(
            (primeiro, segundo) =>
                primeiro.inicio - segundo.inicio ||
                primeiro.indice - segundo.indice,
        );

    return [...new Set(ordenados.map(({ motivo }) => motivo))];
}

export function diaTotalmenteBloqueado(
    dataLocal: string,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
    bloqueios: BloqueioIntervalo,
): boolean {
    const periodosAbertos = obterPeriodosAbertos(
        dataLocal,
        horarioFuncionamento,
    );
    if (periodosAbertos.length === 0) {
        return false;
    }

    const intervalos = intervalosBloqueioNoDia(dataLocal, bloqueios);
    return periodosAbertos.every((periodo) =>
        periodoEstaCoberto(periodo, intervalos),
    );
}

export function calcularPeriodoBloqueado(
    dataLocal: string,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
    bloqueios: BloqueioIntervalo,
    limiteDias = LIMITE_DIAS_RETORNO,
): { bloqueado: boolean; retornoEm: string | null } {
    const bloqueado = diaTotalmenteBloqueado(
        dataLocal,
        horarioFuncionamento,
        bloqueios,
    );

    if (!bloqueado) {
        return { bloqueado: false, retornoEm: null };
    }

    return {
        bloqueado: true,
        retornoEm: primeiroDiaAbertoSemBloqueio(
            dataLocal,
            horarioFuncionamento,
            bloqueios,
            limiteDias,
        ),
    };
}

export function listarPeriodosBloqueados(
    dataInicial: string,
    dias: number,
    horarioFuncionamento: HorarioFuncionamentoConfig[],
    bloqueios: BloqueioIntervalo,
): PeriodoBloqueado[] {
    if (dias <= 0) {
        return [];
    }

    const periodos: PeriodoBloqueado[] = [];
    let inicioGrupo: string | null = null;
    let ultimoDiaBloqueado: string | null = null;

    for (let deslocamento = 0; deslocamento < dias; deslocamento += 1) {
        const data = somarDiasAChaveData(dataInicial, deslocamento);
        if (diaTotalmenteBloqueado(data, horarioFuncionamento, bloqueios)) {
            inicioGrupo ??= data;
            ultimoDiaBloqueado = data;
            continue;
        }

        if (obterPeriodosAbertos(data, horarioFuncionamento).length === 0) {
            continue;
        }

        if (inicioGrupo !== null && ultimoDiaBloqueado !== null) {
            periodos.push({
                inicio: inicioGrupo,
                fim: ultimoDiaBloqueado,
                retornoEm: data,
                motivos: motivosDoPeriodo(
                    inicioGrupo,
                    ultimoDiaBloqueado,
                    horarioFuncionamento,
                    bloqueios,
                ),
            });
            inicioGrupo = null;
            ultimoDiaBloqueado = null;
        }
    }

    if (inicioGrupo !== null && ultimoDiaBloqueado !== null) {
        const diaAposJanela = somarDiasAChaveData(dataInicial, dias);
        periodos.push({
            inicio: inicioGrupo,
            fim: ultimoDiaBloqueado,
            retornoEm: primeiroDiaAbertoSemBloqueio(
                diaAposJanela,
                horarioFuncionamento,
                bloqueios,
                LIMITE_DIAS_RETORNO,
            ),
            motivos: motivosDoPeriodo(
                inicioGrupo,
                ultimoDiaBloqueado,
                horarioFuncionamento,
                bloqueios,
            ),
        });
    }

    return periodos;
}
