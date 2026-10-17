import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

interface CriarLoteData {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string | null;
}

export type LoteAgendamentoComRelacoes = Prisma.LoteAgendamentoGetPayload<{
    include: { cliente: true; servico: true };
}>;

const includeRelacoes = {
    cliente: true,
    servico: true,
} satisfies Prisma.LoteAgendamentoInclude;

export async function criar(
    data: CriarLoteData,
    tx?: Prisma.TransactionClient,
): Promise<LoteAgendamentoComRelacoes> {
    const client = tx ?? prisma;
    return client.loteAgendamento.create({
        data,
        include: includeRelacoes,
    });
}

export async function buscarPorId(
    id: string,
): Promise<LoteAgendamentoComRelacoes | null> {
    return prisma.loteAgendamento.findUnique({
        where: { id },
        include: includeRelacoes,
    });
}
