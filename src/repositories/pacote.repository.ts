import { Prisma, StatusPacoteCliente } from '@prisma/client';
import prisma from '../lib/prisma';

export type PacoteComServicos = Prisma.PacoteGetPayload<{
    include: { servicos: { include: { servico: true } } };
}>;

const includeServicos = {
    servicos: { include: { servico: true } },
} satisfies Prisma.PacoteInclude;

const includePacoteComCiclos = {
    ...includeServicos,
    _count: {
        select: {
            clientes: { where: { status: StatusPacoteCliente.ATIVO } },
        },
    },
} satisfies Prisma.PacoteInclude;

export type SituacaoPacote = 'ativos' | 'arquivados' | 'todos';

type PacoteComContagem = Prisma.PacoteGetPayload<{
    include: typeof includePacoteComCiclos;
}>;

export type PacoteComCiclos = Omit<PacoteComContagem, '_count'> & {
    ciclosAtivos: number;
};

export type ResultadoExclusaoPacote =
    | { tipo: 'excluido' }
    | { tipo: 'nao-encontrado' }
    | { tipo: 'ciclo-ativo'; quantidade: number }
    | { tipo: 'historico'; quantidade: number };

function incluirCiclosAtivos(pacote: PacoteComContagem): PacoteComCiclos {
    const { _count, ...dados } = pacote;
    return { ...dados, ciclosAtivos: _count.clientes };
}

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

export async function listarTodos(
    situacao: SituacaoPacote = 'ativos',
): Promise<PacoteComCiclos[]> {
    const where: Prisma.PacoteWhereInput =
        situacao === 'ativos'
            ? { arquivadoEm: null }
            : situacao === 'arquivados'
              ? { arquivadoEm: { not: null } }
              : {};
    const pacotes = await prisma.pacote.findMany({
        where,
        include: includePacoteComCiclos,
        orderBy: { createdAt: 'desc' },
    });

    return pacotes.map(incluirCiclosAtivos);
}

export async function buscarPorId(
    id: string,
): Promise<PacoteComServicos | null> {
    return prisma.pacote.findUnique({
        where: { id },
        include: includeServicos,
    });
}

export async function bloquearParaCriacaoNaTransacao(
    tx: Prisma.TransactionClient,
    id: string,
): Promise<{ id: string; arquivadoEm: Date | null } | null> {
    const pacotes = await tx.$queryRaw<
        { id: string; arquivadoEm: Date | null }[]
    >(Prisma.sql`
        SELECT "id", "arquivadoEm"
        FROM "pacotes"
        WHERE "id" = ${id}
        FOR SHARE
    `);

    return pacotes[0] ?? null;
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
        await tx.$queryRaw(Prisma.sql`
            SELECT "id" FROM "pacotes" WHERE "id" = ${id} FOR UPDATE
        `);
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
        where: { liberadoParaGemini: true, arquivadoEm: null },
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

export async function arquivarPorId(
    id: string,
): Promise<PacoteComCiclos | null> {
    return prisma.$transaction(async (tx) => {
        const pacotes = await tx.$queryRaw<
            { id: string; arquivadoEm: Date | null }[]
        >(Prisma.sql`
            SELECT "id", "arquivadoEm"
            FROM "pacotes"
            WHERE "id" = ${id}
            FOR UPDATE
        `);
        if (!pacotes[0]) return null;

        if (pacotes[0].arquivadoEm === null) {
            await tx.pacote.update({
                where: { id },
                data: { arquivadoEm: new Date() },
            });
        }

        const atualizado = await tx.pacote.findUnique({
            where: { id },
            include: includePacoteComCiclos,
        });
        return atualizado ? incluirCiclosAtivos(atualizado) : null;
    });
}

export async function desarquivarPorId(
    id: string,
): Promise<PacoteComCiclos | null> {
    return prisma.$transaction(async (tx) => {
        const pacotes = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT "id" FROM "pacotes" WHERE "id" = ${id} FOR UPDATE
        `);
        if (pacotes.length === 0) return null;

        await tx.pacote.updateMany({
            where: { id, arquivadoEm: { not: null } },
            data: { arquivadoEm: null },
        });

        const atualizado = await tx.pacote.findUnique({
            where: { id },
            include: includePacoteComCiclos,
        });
        return atualizado ? incluirCiclosAtivos(atualizado) : null;
    });
}

export async function excluirPorId(
    id: string,
): Promise<ResultadoExclusaoPacote> {
    return prisma.$transaction(async (tx) => {
        const pacotes = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
            SELECT "id" FROM "pacotes" WHERE "id" = ${id} FOR UPDATE
        `);
        if (pacotes.length === 0) return { tipo: 'nao-encontrado' };

        const ativos = await tx.pacoteCliente.count({
            where: { pacoteId: id, status: StatusPacoteCliente.ATIVO },
        });
        if (ativos > 0) return { tipo: 'ciclo-ativo', quantidade: ativos };

        const total = await tx.pacoteCliente.count({ where: { pacoteId: id } });
        if (total > 0) return { tipo: 'historico', quantidade: total };

        await tx.pacoteServico.deleteMany({ where: { pacoteId: id } });
        await tx.pacote.delete({ where: { id } });

        return { tipo: 'excluido' };
    });
}
