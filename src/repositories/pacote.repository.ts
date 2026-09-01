import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

export type PacoteComServicos = Prisma.PacoteGetPayload<{
    include: { servicos: { include: { servico: true } } };
}>;

const includeServicos = {
    servicos: { include: { servico: true } },
} satisfies Prisma.PacoteInclude;

export async function criar(data: {
    nome: string;
    duracaoDias: number;
    quantidade: number;
    servicoIds: string[];
}): Promise<PacoteComServicos> {
    return prisma.pacote.create({
        data: {
            nome: data.nome,
            duracaoDias: data.duracaoDias,
            quantidade: data.quantidade,
            servicos: {
                create: data.servicoIds.map((servicoId) => ({ servicoId })),
            },
        },
        include: includeServicos,
    });
}

export async function listarTodos(): Promise<PacoteComServicos[]> {
    return prisma.pacote.findMany({
        include: includeServicos,
        orderBy: { createdAt: 'desc' },
    });
}

export async function buscarPorId(
    id: string,
): Promise<PacoteComServicos | null> {
    return prisma.pacote.findUnique({
        where: { id },
        include: includeServicos,
    });
}

export async function atualizar(
    id: string,
    data: {
        nome: string;
        duracaoDias: number;
        quantidade: number;
        servicoIds: string[];
    },
): Promise<PacoteComServicos> {
    return prisma.$transaction(async (tx) => {
        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });

        return tx.pacote.update({
            where: { id },
            data: {
                nome: data.nome,
                duracaoDias: data.duracaoDias,
                quantidade: data.quantidade,
                servicos: {
                    create: data.servicoIds.map((servicoId) => ({
                        servicoId,
                    })),
                },
            },
            include: includeServicos,
        });
    });
}

export async function excluirPorId(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });
        await tx.pacote.delete({ where: { id } });
    });
}

export async function contarClientesVinculados(id: string): Promise<number> {
    return prisma.pacoteCliente.count({ where: { pacoteId: id } });
}
