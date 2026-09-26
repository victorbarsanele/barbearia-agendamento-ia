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
    preco: number;
    liberadoParaGemini: boolean;
    servicos: { servicoId: string; quantidade: number }[];
}): Promise<PacoteComServicos> {
    return prisma.pacote.create({
        data: {
            nome: data.nome,
            duracaoDias: data.duracaoDias,
            preco: data.preco,
            liberadoParaGemini: data.liberadoParaGemini,
            servicos: {
                create: data.servicos.map((servico) => ({
                    servicoId: servico.servicoId,
                    quantidadeTotal: servico.quantidade,
                })),
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
        preco: number;
        liberadoParaGemini: boolean;
        servicos: { servicoId: string; quantidade: number }[];
    },
): Promise<PacoteComServicos> {
    return prisma.$transaction(async (tx) => {
        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });

        return tx.pacote.update({
            where: { id },
            data: {
                nome: data.nome,
                duracaoDias: data.duracaoDias,
                preco: data.preco,
                liberadoParaGemini: data.liberadoParaGemini,
                servicos: {
                    create: data.servicos.map((servico) => ({
                        servicoId: servico.servicoId,
                        quantidadeTotal: servico.quantidade,
                    })),
                },
            },
            include: includeServicos,
        });
    });
}

export async function listarLiberadosParaGemini(): Promise<
    {
        nome: string;
        preco: number;
        servicos: { nome: string; quantidade: number }[];
    }[]
> {
    const pacotes = await prisma.pacote.findMany({
        where: { liberadoParaGemini: true },
        select: {
            nome: true,
            preco: true,
            servicos: {
                select: {
                    quantidadeTotal: true,
                    servico: { select: { nome: true } },
                },
            },
        },
        orderBy: { nome: 'asc' },
    });

    return pacotes.map((pacote) => ({
        nome: pacote.nome,
        preco: Number(pacote.preco),
        servicos: pacote.servicos.map((item) => ({
            nome: item.servico.nome,
            quantidade: item.quantidadeTotal,
        })),
    }));
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
