import { Cliente } from '@prisma/client';
import prisma from '../lib/prisma';

export async function criar(data: {
    nome: string;
    telefone: string;
}): Promise<Cliente> {
    return prisma.cliente.create({ data });
}

export async function buscarPorTelefone(
    telefone: string,
): Promise<Cliente | null> {
    return prisma.cliente.findUnique({ where: { telefone } });
}

export async function buscarPorId(id: string): Promise<Cliente | null> {
    return prisma.cliente.findUnique({ where: { id } });
}

export async function atualizar(
    id: string,
    data: { nome: string; telefone: string },
): Promise<Cliente> {
    return prisma.cliente.update({
        where: { id },
        data,
    });
}

export async function excluirPorId(id: string): Promise<void> {
    await prisma.cliente.delete({ where: { id } });
}

export async function listarTodos(): Promise<Cliente[]> {
    return prisma.cliente.findMany({ orderBy: { createdAt: 'desc' } });
}

function buildWhereBusca(search?: string) {
    if (!search) {
        return undefined;
    }

    return {
        OR: [
            { nome: { contains: search, mode: 'insensitive' as const } },
            { telefone: { contains: search } },
        ],
    };
}

export async function listarPaginado(params: {
    search?: string;
    skip: number;
    take: number;
}): Promise<Cliente[]> {
    return prisma.cliente.findMany({
        where: buildWhereBusca(params.search),
        orderBy: { createdAt: 'desc' },
        skip: params.skip,
        take: params.take,
    });
}

export async function contar(params: { search?: string }): Promise<number> {
    return prisma.cliente.count({ where: buildWhereBusca(params.search) });
}
