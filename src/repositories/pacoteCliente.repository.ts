import { PacoteCliente, Prisma, StatusPacoteCliente } from '@prisma/client';
import prisma from '../lib/prisma';

export type PacoteClienteComPacote = Prisma.PacoteClienteGetPayload<{
    include: {
        pacote: { include: { servicos: { include: { servico: true } } } };
        servicos: { include: { servico: true } };
    };
}>;

const includePacote = {
    pacote: { include: { servicos: { include: { servico: true } } } },
    servicos: { include: { servico: true } },
} satisfies Prisma.PacoteClienteInclude;

export async function criar(data: {
    clienteId: string;
    pacoteId: string;
    servicos: { servicoId: string; quantidadeTotal: number }[];
    dataInicio: Date;
}): Promise<PacoteClienteComPacote> {
    return prisma.pacoteCliente.create({
        data: {
            clienteId: data.clienteId,
            pacoteId: data.pacoteId,
            dataInicio: data.dataInicio,
            status: StatusPacoteCliente.ATIVO,
            servicos: {
                create: data.servicos.map((servico) => ({
                    servicoId: servico.servicoId,
                    quantidadeTotal: servico.quantidadeTotal,
                    quantidadeRestante: servico.quantidadeTotal,
                })),
            },
        },
        include: includePacote,
    });
}

export async function buscarAtivoPorClienteId(
    clienteId: string,
): Promise<PacoteClienteComPacote | null> {
    return prisma.pacoteCliente.findFirst({
        where: { clienteId, status: StatusPacoteCliente.ATIVO },
        include: includePacote,
    });
}

export async function buscarPorId(
    id: string,
): Promise<PacoteClienteComPacote | null> {
    return prisma.pacoteCliente.findUnique({
        where: { id },
        include: includePacote,
    });
}

export async function atualizarStatus(
    id: string,
    status: StatusPacoteCliente,
): Promise<PacoteCliente> {
    return prisma.pacoteCliente.update({
        where: { id },
        data: { status },
    });
}
