import { BloqueioHorario, EscopoBloqueio } from '@prisma/client';
import prisma from '../lib/prisma';
import { toZonedTime } from 'date-fns-tz';

const TIME_ZONE = 'America/Sao_Paulo';

export type OrigemAgendamento = 'PAINEL' | 'GEMINI';

export async function criar(data: {
    dataHoraInicio?: Date;
    dataHoraFim?: Date;
    motivo: string;
    escopo: EscopoBloqueio;
    recorrencia: 'PONTUAL' | 'SEMANAL';
    diaSemana?: number;
    horaInicioMinutos?: number;
    horaFimMinutos?: number;
}): Promise<BloqueioHorario> {
    return prisma.bloqueioHorario.create({ data });
}

export async function listarTodos(filtro?: {
    dataHoraInicio?: Date;
    dataHoraFim?: Date;
}): Promise<BloqueioHorario[]> {
    const bloqueios = await prisma.bloqueioHorario.findMany({
        orderBy: { dataHoraInicio: 'asc' },
    });

    if (!filtro?.dataHoraInicio && !filtro?.dataHoraFim) {
        return bloqueios;
    }

    const referencia = toZonedTime(
        filtro.dataHoraInicio ?? filtro.dataHoraFim!,
        TIME_ZONE,
    );
    const diaSemana = referencia.getDay();

    return bloqueios.filter((bloqueio) => {
        if (bloqueio.recorrencia === 'SEMANAL') {
            return bloqueio.diaSemana === diaSemana;
        }

        if (!bloqueio.dataHoraInicio || !bloqueio.dataHoraFim) {
            return false;
        }

        return (
            (!filtro.dataHoraFim ||
                bloqueio.dataHoraInicio < filtro.dataHoraFim) &&
            (!filtro.dataHoraInicio ||
                bloqueio.dataHoraFim > filtro.dataHoraInicio)
        );
    });
}

export async function buscarConflito(
    dataHoraInicio: Date,
    dataHoraFim: Date,
    origem: OrigemAgendamento = 'PAINEL',
): Promise<BloqueioHorario | null> {
    const bloqueios = await listarTodos({ dataHoraInicio, dataHoraFim });
    const inicioEmBrasilia = toZonedTime(dataHoraInicio, TIME_ZONE);
    const fimEmBrasilia = toZonedTime(dataHoraFim, TIME_ZONE);
    const inicioMinutos =
        inicioEmBrasilia.getHours() * 60 + inicioEmBrasilia.getMinutes();
    const fimMinutos =
        fimEmBrasilia.getHours() * 60 + fimEmBrasilia.getMinutes();

    return (
        bloqueios.find((bloqueio) => {
            if (
                origem === 'PAINEL' &&
                bloqueio.escopo === EscopoBloqueio.SO_PAINEL
            ) {
                return false;
            }

            if (bloqueio.recorrencia === 'SEMANAL') {
                return (
                    bloqueio.horaInicioMinutos !== null &&
                    bloqueio.horaFimMinutos !== null &&
                    bloqueio.horaInicioMinutos < fimMinutos &&
                    bloqueio.horaFimMinutos > inicioMinutos
                );
            }

            return (
                bloqueio.dataHoraInicio !== null &&
                bloqueio.dataHoraFim !== null &&
                bloqueio.dataHoraInicio < dataHoraFim &&
                bloqueio.dataHoraFim > dataHoraInicio
            );
        }) ?? null
    );
}

export async function excluirPorId(id: string): Promise<void> {
    await prisma.bloqueioHorario.delete({ where: { id } });
}
