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

export interface CriarPacoteClienteData {
    clienteId: string;
    pacoteId: string;
    servicos: {
        servicoId: string;
        quantidadeTotal: number;
        usosAnteriores: number;
    }[];
    dataInicio: Date;
}

export async function criarNaTransacao(
    tx: Prisma.TransactionClient,
    data: CriarPacoteClienteData,
): Promise<PacoteClienteComPacote> {
    return tx.pacoteCliente.create({
        data: {
            clienteId: data.clienteId,
            pacoteId: data.pacoteId,
            dataInicio: data.dataInicio,
            status: StatusPacoteCliente.ATIVO,
            servicos: {
                create: data.servicos.map((servico) => ({
                    servicoId: servico.servicoId,
                    quantidadeTotal: servico.quantidadeTotal,
                    usosAnteriores: servico.usosAnteriores,
                    quantidadeRestante:
                        servico.quantidadeTotal - servico.usosAnteriores,
                })),
            },
        },
        include: includePacote,
    });
}

export async function criar(
    data: CriarPacoteClienteData,
): Promise<PacoteClienteComPacote> {
    return prisma.$transaction((tx) => criarNaTransacao(tx, data));
}

export async function buscarAtivoPorClienteId(
    clienteId: string,
    tx?: Prisma.TransactionClient,
): Promise<PacoteClienteComPacote | null> {
    const client = tx ?? prisma;
    return client.pacoteCliente.findFirst({
        where: { clienteId, status: StatusPacoteCliente.ATIVO },
        include: includePacote,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
}

export async function transacionar<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
    },
): Promise<T> {
    return prisma.$transaction(operation, options);
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
