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
