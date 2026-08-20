import { BloqueioHorario } from '@prisma/client';
import prisma from '../lib/prisma';

export async function criar(data: {
    dataHoraInicio: Date;
    dataHoraFim: Date;
    motivo: string;
}): Promise<BloqueioHorario> {
    return prisma.bloqueioHorario.create({ data });
}

export async function listarTodos(filtro?: {
    dataHoraInicio?: Date;
    dataHoraFim?: Date;
}): Promise<BloqueioHorario[]> {
    return prisma.bloqueioHorario.findMany({
        where: {
            ...(filtro?.dataHoraInicio || filtro?.dataHoraFim
                ? {
                      dataHoraInicio: filtro.dataHoraFim
                          ? { lt: filtro.dataHoraFim }
                          : undefined,
                      dataHoraFim: filtro.dataHoraInicio
                          ? { gt: filtro.dataHoraInicio }
                          : undefined,
                  }
                : {}),
        },
        orderBy: { dataHoraInicio: 'asc' },
    });
}

export async function buscarConflito(
    dataHoraInicio: Date,
    dataHoraFim: Date,
): Promise<BloqueioHorario | null> {
    return prisma.bloqueioHorario.findFirst({
        where: {
            dataHoraInicio: { lt: dataHoraFim },
            dataHoraFim: { gt: dataHoraInicio },
        },
        orderBy: { dataHoraInicio: 'asc' },
    });
}

export async function excluirPorId(id: string): Promise<void> {
    await prisma.bloqueioHorario.delete({ where: { id } });
}
