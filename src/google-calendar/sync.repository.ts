import prisma from '../lib/prisma';

export const TAMANHO_LOTE_ENFILEIRAMENTO = 20;
export const TIMEOUT_TRANSACAO_MS = 20_000;
export const MAXWAIT_TRANSACAO_MS = 10_000;

export interface FalhaLoteEnfileiramento {
    erro: unknown;
    quantidadeIds: number;
    indiceLote: number;
    totalLotes: number;
    duracaoMs: number;
}

export interface ResultadoEnfileiramento {
    total: number;
    falhas: number;
    lotesFalhos: FalhaLoteEnfileiramento[];
}

export type ItemSincronizacao = {
    agendamentoId: string;
    tentativas: number;
    versao: number;
};

export type ResultadoFinalizacao = {
    status: 'SINCRONIZADO' | 'PENDENTE' | 'ERRO';
    tentativas: number;
    proximaTentativaEm: Date;
    ultimoErro: string | null;
};

export async function enfileirar(
    ids: string[],
): Promise<ResultadoEnfileiramento> {
    const agora = new Date();
    const lotes: string[][] = [];
    for (
        let inicio = 0;
        inicio < ids.length;
        inicio += TAMANHO_LOTE_ENFILEIRAMENTO
    ) {
        lotes.push(ids.slice(inicio, inicio + TAMANHO_LOTE_ENFILEIRAMENTO));
    }

    const lotesFalhos: FalhaLoteEnfileiramento[] = [];
    for (const [indice, lote] of lotes.entries()) {
        const iniciadoEm = Date.now();
        try {
            await prisma.$transaction(
                lote.map((agendamentoId) =>
                    prisma.sincronizacaoGoogleAgenda.upsert({
                        where: { agendamentoId },
                        create: {
                            agendamentoId,
                            status: 'PENDENTE',
                            proximaTentativaEm: agora,
                        },
                        update: {
                            status: 'PENDENTE',
                            tentativas: 0,
                            proximaTentativaEm: agora,
                            ultimoErro: null,
                            versao: { increment: 1 },
                        },
                    }),
                ),
                {
                    timeout: TIMEOUT_TRANSACAO_MS,
                    maxWait: MAXWAIT_TRANSACAO_MS,
                },
            );
        } catch (erro) {
            lotesFalhos.push({
                erro,
                quantidadeIds: lote.length,
                indiceLote: indice + 1,
                totalLotes: lotes.length,
                duracaoMs: Date.now() - iniciadoEm,
            });
        }
    }

    return {
        total: ids.length,
        falhas: lotesFalhos.reduce(
            (total, falha) => total + falha.quantidadeIds,
            0,
        ),
        lotesFalhos,
    };
}

export async function reivindicar(
    agora = new Date(),
    limite = 10,
): Promise<ItemSincronizacao[]> {
    const candidatos = await prisma.sincronizacaoGoogleAgenda.findMany({
        where: { status: 'PENDENTE', proximaTentativaEm: { lte: agora } },
        orderBy: { proximaTentativaEm: 'asc' },
        take: limite,
        select: { agendamentoId: true, tentativas: true, versao: true },
    });
    const reivindicados: ItemSincronizacao[] = [];
    const leaseAte = new Date(agora.getTime() + 2 * 60 * 1000);

    for (const candidato of candidatos) {
        const atualizado = await prisma.sincronizacaoGoogleAgenda.updateMany({
            where: {
                agendamentoId: candidato.agendamentoId,
                status: 'PENDENTE',
                proximaTentativaEm: { lte: agora },
                versao: candidato.versao,
            },
            data: { proximaTentativaEm: leaseAte },
        });
        if (atualizado.count === 1) reivindicados.push(candidato);
    }

    return reivindicados;
}

export async function finalizar(
    agendamentoId: string,
    versao: number,
    resultado: ResultadoFinalizacao,
): Promise<boolean> {
    const atualizado = await prisma.sincronizacaoGoogleAgenda.updateMany({
        where: { agendamentoId, versao },
        data: resultado,
    });
    return atualizado.count === 1;
}

export async function buscarAgendamento(agendamentoId: string) {
    return prisma.agendamento.findUnique({
        where: { id: agendamentoId },
        include: { cliente: true, servico: true },
    });
}

export async function listarAgendamentosDesde(data: Date) {
    return prisma.agendamento.findMany({
        where: { dataHoraInicio: { gte: data } },
        include: { cliente: true, servico: true },
    });
}

export async function listarIdsFuturosPorCliente(
    clienteId: string,
    agora = new Date(),
): Promise<string[]> {
    const itens = await prisma.agendamento.findMany({
        where: { clienteId, dataHoraInicio: { gte: agora } },
        select: { id: true },
    });
    return itens.map(({ id }) => id);
}

export async function listarIdsFuturosPorServico(
    servicoId: string,
    agora = new Date(),
): Promise<string[]> {
    const itens = await prisma.agendamento.findMany({
        where: { servicoId, dataHoraInicio: { gte: agora } },
        select: { id: true },
    });
    return itens.map(({ id }) => id);
}

export async function listarIdsPorCliente(
    clienteId: string,
): Promise<string[]> {
    const itens = await prisma.agendamento.findMany({
        where: { clienteId },
        select: { id: true },
    });
    return itens.map(({ id }) => id);
}
