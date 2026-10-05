import {
    Cliente,
    Prisma,
    StatusAgendamento,
    StatusPacoteCliente,
} from '@prisma/client';
import { AppError } from '../lib/app-error';
import prisma from '../lib/prisma';
import { isAgendamentoConcluido } from '../utils/agendamento';
import { normalizarTelefone } from '../utils/telefone';

export interface ResumoExclusaoCliente {
    cliente: { id: string; nome: string };
    agendamentos: {
        concluidos: number;
        cancelados: number;
        passados: number;
        emAberto: number;
    };
    pacotes: {
        ativos: number;
        finalizados: number;
        cancelados: number;
    };
    lotes: number;
    temHistorico: boolean;
    impedimentos: string[];
}

const MENSAGEM_IMPEDIMENTO =
    'Não é possível excluir cliente com pacote ativo ou agendamentos futuros em aberto.';

function criarResumoExclusao(
    cliente: { id: string; nome: string },
    agendamentos: Array<{
        status: StatusAgendamento;
        concluido: boolean;
        dataHoraInicio: Date;
    }>,
    pacotes: StatusPacoteCliente[],
    lotes: number,
    agora: Date,
): ResumoExclusaoCliente {
    const contagem = {
        concluidos: 0,
        cancelados: 0,
        passados: 0,
        emAberto: 0,
    };

    for (const agendamento of agendamentos) {
        if (agendamento.status === StatusAgendamento.CANCELADO) {
            contagem.cancelados += 1;
        } else if (isAgendamentoConcluido(agendamento)) {
            contagem.concluidos += 1;
        } else if (agendamento.dataHoraInicio < agora) {
            contagem.passados += 1;
        } else if (
            agendamento.status === StatusAgendamento.AGENDADO ||
            agendamento.status === StatusAgendamento.CONFIRMADO
        ) {
            contagem.emAberto += 1;
        }
    }

    const pacotesContagem = {
        ativos: pacotes.filter((status) => status === StatusPacoteCliente.ATIVO)
            .length,
        finalizados: pacotes.filter(
            (status) => status === StatusPacoteCliente.FINALIZADO,
        ).length,
        cancelados: pacotes.filter(
            (status) => status === StatusPacoteCliente.CANCELADO,
        ).length,
    };

    const impedimentos: string[] = [];
    if (pacotesContagem.ativos > 0) {
        impedimentos.push('Cliente possui pacote ativo.');
    }
    if (contagem.emAberto > 0) {
        impedimentos.push('Cliente possui agendamentos futuros em aberto.');
    }

    return {
        cliente,
        agendamentos: contagem,
        pacotes: pacotesContagem,
        lotes,
        temHistorico:
            agendamentos.some(
                (agendamento) =>
                    agendamento.status !== StatusAgendamento.CANCELADO,
            ) || pacotes.length > 0,
        impedimentos,
    };
}

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

export async function obterResumoExclusao(
    id: string,
    agora = new Date(),
): Promise<ResumoExclusaoCliente | null> {
    const cliente = await prisma.cliente.findUnique({
        where: { id },
        select: { id: true, nome: true },
    });
    if (!cliente) {
        return null;
    }

    const [agendamentos, pacotes, lotes] = await Promise.all([
        prisma.agendamento.findMany({
            where: { clienteId: id },
            select: {
                status: true,
                concluido: true,
                dataHoraInicio: true,
            },
        }),
        prisma.pacoteCliente.findMany({
            where: { clienteId: id },
            select: { status: true },
        }),
        prisma.loteAgendamento.count({ where: { clienteId: id } }),
    ]);

    return criarResumoExclusao(
        cliente,
        agendamentos,
        pacotes.map((item) => item.status),
        lotes,
        agora,
    );
}

export async function excluirComHistorico(
    id: string,
    agora = new Date(),
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const clienteBloqueado = await tx.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT "id" FROM "clientes" WHERE "id" = ${id} FOR UPDATE`,
        );
        if (clienteBloqueado.length === 0) {
            throw new AppError('Cliente não encontrado.', 404);
        }

        const [pacotesAtivos, agendamentosEmAberto] = await Promise.all([
            tx.pacoteCliente.count({
                where: { clienteId: id, status: StatusPacoteCliente.ATIVO },
            }),
            tx.agendamento.count({
                where: {
                    clienteId: id,
                    status: {
                        in: [
                            StatusAgendamento.AGENDADO,
                            StatusAgendamento.CONFIRMADO,
                        ],
                    },
                    concluido: false,
                    dataHoraInicio: { gte: agora },
                },
            }),
        ]);

        if (pacotesAtivos > 0 || agendamentosEmAberto > 0) {
            throw new AppError(MENSAGEM_IMPEDIMENTO, 409);
        }

        await tx.agendamento.deleteMany({ where: { clienteId: id } });
        await tx.loteAgendamento.deleteMany({ where: { clienteId: id } });
        await tx.pacoteCliente.deleteMany({ where: { clienteId: id } });
        await tx.cliente.delete({ where: { id } });
    });
}

export async function listarTodos(): Promise<Cliente[]> {
    return prisma.cliente.findMany({ orderBy: { createdAt: 'desc' } });
}

function buildWhereBusca(search?: string) {
    if (!search) {
        return undefined;
    }

    const telefoneNormalizado = normalizarTelefone(search);
    const pareceTelefone =
        /^[\d\s()+./-]+$/.test(search) && telefoneNormalizado.length > 0;

    return {
        OR: [
            { nome: { contains: search, mode: 'insensitive' as const } },
            {
                telefone: {
                    contains: pareceTelefone ? telefoneNormalizado : search,
                },
            },
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
