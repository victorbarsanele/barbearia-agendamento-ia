import prisma from '../lib/prisma';

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

export async function enfileirar(ids: string[]): Promise<void> {
    const agora = new Date();
    await prisma.$transaction(
        ids.map((agendamentoId) =>
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
    );
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
