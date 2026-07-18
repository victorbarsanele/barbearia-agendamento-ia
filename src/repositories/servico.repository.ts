import { Servico } from '@prisma/client';
import prisma from '../lib/prisma';

export async function criar(data: {
    nome: string;
    duracaoMinutos: number;
    preco: number | null;
}): Promise<Servico> {
    return prisma.servico.create({ data });
}

export async function buscarPorId(id: string): Promise<Servico | null> {
    return prisma.servico.findUnique({ where: { id } });
}

export async function atualizar(
    id: string,
    data: { nome: string; duracaoMinutos: number; preco: number | null },
): Promise<Servico> {
    return prisma.servico.update({
        where: { id },
        data,
    });
}

export async function excluirPorId(id: string): Promise<void> {
    await prisma.servico.delete({ where: { id } });
}

export async function listarTodos(): Promise<Servico[]> {
    return prisma.servico.findMany({ orderBy: { nome: 'asc' } });
}
