import { Prisma, StatusAgendamento } from '@prisma/client';
import prisma from '../lib/prisma';

export type AgendamentoComRelacoes = Prisma.AgendamentoGetPayload<{
    include: {
        cliente: true;
        servico: true;
    };
}>;

interface SalvarAgendamentoData {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: Date;
    dataHoraFim: Date;
    status?: StatusAgendamento;
}

interface BuscarConflitoParams {
    dataHoraInicio: Date;
    dataHoraFim: Date;
    ignorarAgendamentoId?: string;
}

const includeRelacoes = {
    cliente: true,
    servico: true,
} satisfies Prisma.AgendamentoInclude;

export async function criar(
    data: SalvarAgendamentoData,
): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.create({
            data,
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function listarTodos(): Promise<AgendamentoComRelacoes[]> {
    try {
        return await prisma.agendamento.findMany({
            include: includeRelacoes,
            orderBy: { dataHoraInicio: 'asc' },
        });
    } catch (error) {
        throw error;
    }
}

export async function buscarPorId(
    id: string,
): Promise<AgendamentoComRelacoes | null> {
    try {
        return await prisma.agendamento.findUnique({
            where: { id },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function buscarConflito(
    params: BuscarConflitoParams,
): Promise<AgendamentoComRelacoes | null> {
    try {
        return await prisma.agendamento.findFirst({
            where: {
                status: { not: StatusAgendamento.CANCELADO },
                dataHoraInicio: { lt: params.dataHoraFim },
                dataHoraFim: { gt: params.dataHoraInicio },
                ...(params.ignorarAgendamentoId
                    ? { id: { not: params.ignorarAgendamentoId } }
                    : {}),
            },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function atualizar(
    id: string,
    data: SalvarAgendamentoData,
): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.update({
            where: { id },
            data,
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function cancelar(id: string): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.update({
            where: { id },
            data: { status: StatusAgendamento.CANCELADO },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function contarAtivosPorClienteId(id: string): Promise<number> {
    try {
        return await prisma.agendamento.count({
            where: {
                clienteId: id,
                status: { not: StatusAgendamento.CANCELADO },
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function contarAtivosPorServicoId(id: string): Promise<number> {
    try {
        return await prisma.agendamento.count({
            where: {
                servicoId: id,
                status: { not: StatusAgendamento.CANCELADO },
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function excluirCanceladosPorClienteId(id: string): Promise<void> {
    try {
        await prisma.agendamento.deleteMany({
            where: {
                clienteId: id,
                status: StatusAgendamento.CANCELADO,
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function excluirCanceladosPorServicoId(id: string): Promise<void> {
    try {
        await prisma.agendamento.deleteMany({
            where: {
                servicoId: id,
                status: StatusAgendamento.CANCELADO,
            },
        });
    } catch (error) {
        throw error;
    }
}
