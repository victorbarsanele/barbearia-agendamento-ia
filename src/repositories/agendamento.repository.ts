import {
    PacoteCliente,
    Prisma,
    StatusAgendamento,
    StatusPacoteCliente,
} from '@prisma/client';
import { AppError } from '../lib/app-error';
import prisma from '../lib/prisma';

type AgendamentoBase = Prisma.AgendamentoGetPayload<{
    include: {
        cliente: true;
        servico: true;
    };
}>;

export type AgendamentoComRelacoes = Omit<AgendamentoBase, 'numeroNoPacote'> & {
    numeroNoPacote?: number | null;
};

interface SalvarAgendamentoData {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string | null;
    loteId?: string | null;
    dataHoraInicio: Date;
    dataHoraFim: Date;
    status?: StatusAgendamento;
}

interface BuscarConflitoParams {
    dataHoraInicio: Date;
    dataHoraFim: Date;
    ignorarAgendamentoId?: string;
}

type Transacao = Prisma.TransactionClient;

const includeRelacoes = {
    cliente: true,
    servico: true,
} satisfies Prisma.AgendamentoInclude;

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function hasConstraintName(texto: string): boolean {
    const normalizado = texto.toLowerCase();
    return (
        normalizado.includes('sem_sobreposicao_horario') ||
        (normalizado.includes('exclusion constraint') &&
            normalizado.includes('agendamento'))
    );
}

export function isViolacaoDeSobreposicao(error: unknown): boolean {
    const visitados = new Set<unknown>();
    const fila: unknown[] = [error];

    while (fila.length > 0) {
        const atual = fila.shift();

        if (!isObject(atual) || visitados.has(atual)) {
            continue;
        }

        visitados.add(atual);

        const codigo =
            typeof atual.code === 'string'
                ? atual.code
                : typeof atual['sqlState'] === 'string'
                  ? (atual['sqlState'] as string)
                  : undefined;

        if (codigo === '23P01') {
            return true;
        }

        if (typeof atual.message === 'string') {
            const mensagem = atual.message.toLowerCase();
            if (mensagem.includes('23p01') || hasConstraintName(mensagem)) {
                return true;
            }
        }

        if (isObject(atual.meta)) {
            const meta = atual.meta;

            if (
                (typeof meta.code === 'string' && meta.code === '23P01') ||
                (typeof meta['sqlState'] === 'string' &&
                    meta['sqlState'] === '23P01')
            ) {
                return true;
            }

            for (const valor of Object.values(meta)) {
                if (
                    typeof valor === 'string' &&
                    (valor.toLowerCase().includes('23p01') ||
                        hasConstraintName(valor))
                ) {
                    return true;
                }

                if (isObject(valor)) {
                    fila.push(valor);
                }
            }
        }

        if (isObject(atual.cause)) {
            fila.push(atual.cause);
        }
    }

    return false;
}

export async function criar(
    data: SalvarAgendamentoData,
): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.create({
            data,
            include: includeRelacoes,
        });
    } catch (error) {
        if (isViolacaoDeSobreposicao(error)) {
            throw new AppError('Já existe um agendamento nesse horário.', 409);
        }

        throw error;
    }
}

async function reservarNumeroNoPacote(
    tx: Transacao,
    pacoteClienteId: string,
    servicoId: string,
    ignorarAgendamentoId?: string,
): Promise<number> {
    const saldos = await tx.$queryRaw<
        { quantidadeTotal: number; usosAnteriores: number }[]
    >(
        Prisma.sql`
            SELECT "quantidadeTotal", "usosAnteriores"
            FROM "pacotes_clientes_servicos"
            WHERE "pacoteClienteId" = ${pacoteClienteId}
              AND "servicoId" = ${servicoId}
            FOR UPDATE
        `,
    );
    const saldo = saldos[0];

    if (!saldo) {
        throw new AppError('Pacote do cliente não encontrado.', 404);
    }

    const ocupados = await tx.$queryRaw<
        { numeroNoPacote: number }[]
    >(Prisma.sql`
        SELECT "numeroNoPacote"
        FROM "agendamentos"
        WHERE "pacoteClienteId" = ${pacoteClienteId}
          AND "servicoId" = ${servicoId}
          AND status <> ${StatusAgendamento.CANCELADO}
          AND "numeroNoPacote" IS NOT NULL
          ${ignorarAgendamentoId ? Prisma.sql`AND id <> ${ignorarAgendamentoId}` : Prisma.empty}
    `);
    const ocupadosSet = new Set(
        ocupados.map(({ numeroNoPacote }) => numeroNoPacote),
    );

    for (
        let numero = saldo.usosAnteriores + 1;
        numero <= saldo.quantidadeTotal;
        numero += 1
    ) {
        if (!ocupadosSet.has(numero)) {
            return numero;
        }
    }

    throw new AppError(
        `Todos os ${saldo.quantidadeTotal - saldo.usosAnteriores} usos restantes deste serviço no pacote já estão agendados ou concluídos.`,
        400,
    );
}

export async function criarComNumeroNoPacote(
    data: SalvarAgendamentoData,
    pacoteClienteId: string,
    servicoId: string,
): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.$transaction(async (tx) => {
            const numeroNoPacote = await reservarNumeroNoPacote(
                tx,
                pacoteClienteId,
                servicoId,
            );

            return tx.agendamento.create({
                data: { ...data, numeroNoPacote },
                include: includeRelacoes,
            });
        });
    } catch (error) {
        if (isViolacaoDeSobreposicao(error)) {
            throw new AppError('Já existe um agendamento nesse horário.', 409);
        }

        throw error;
    }
}

export async function contarNaoCanceladosPorPacoteEServico(
    pacoteClienteId: string,
    servicoId: string,
): Promise<number> {
    return prisma.agendamento.count({
        where: {
            pacoteClienteId,
            servicoId,
            status: { not: StatusAgendamento.CANCELADO },
        },
    });
}

export async function listarTodos(): Promise<AgendamentoComRelacoes[]> {
    try {
        const agendamentos = await prisma.agendamento.findMany({
            include: {
                ...includeRelacoes,
                pacoteCliente: {
                    select: {
                        servicos: {
                            select: {
                                servicoId: true,
                                quantidadeTotal: true,
                                usosAnteriores: true,
                            },
                        },
                    },
                },
            },
            orderBy: { dataHoraInicio: 'asc' },
        });

        return agendamentos.map(({ pacoteCliente, ...agendamento }) => ({
            ...agendamento,
            totalServicoNoPacote:
                pacoteCliente?.servicos.find(
                    (item) => item.servicoId === agendamento.servicoId,
                )?.quantidadeTotal ?? null,
            usosAnteriores:
                pacoteCliente?.servicos.find(
                    (item) => item.servicoId === agendamento.servicoId,
                )?.usosAnteriores ?? null,
        }));
    } catch (error) {
        throw error;
    }
}

async function atualizarStatusConformeSaldos(
    tx: Transacao,
    pacoteClienteId: string,
): Promise<PacoteCliente> {
    const saldosRestantes = await tx.pacoteClienteServico.count({
        where: { pacoteClienteId, quantidadeRestante: { gt: 0 } },
    });

    return tx.pacoteCliente.update({
        where: { id: pacoteClienteId },
        data: {
            status:
                saldosRestantes === 0
                    ? StatusPacoteCliente.FINALIZADO
                    : StatusPacoteCliente.ATIVO,
        },
    });
}

export async function atualizarUsosAnteriores(
    pacoteClienteId: string,
    servicoId: string,
    novosUsosAnteriores: number,
): Promise<PacoteCliente> {
    return prisma.$transaction(async (tx) => {
        const saldos = await tx.$queryRaw<
            {
                id: string;
                quantidadeTotal: number;
                usosAnteriores: number;
                quantidadeRestante: number;
            }[]
        >(Prisma.sql`
            SELECT pcs."id", pcs."quantidadeTotal", pcs."usosAnteriores", pcs."quantidadeRestante"
            FROM "pacotes_clientes_servicos" AS pcs
            WHERE pcs."pacoteClienteId" = ${pacoteClienteId}
              AND pcs."servicoId" = ${servicoId}
            FOR UPDATE
        `);
        const saldo = saldos[0];

        if (!saldo) {
            throw new AppError(
                'Serviço não encontrado no pacote do cliente.',
                404,
            );
        }

        const pacoteCliente = await tx.pacoteCliente.findUnique({
            where: { id: pacoteClienteId },
            select: { status: true },
        });
        if (!pacoteCliente) {
            throw new AppError('Pacote do cliente não encontrado.', 404);
        }
        if (pacoteCliente.status !== StatusPacoteCliente.ATIVO) {
            throw new AppError('Pacote do cliente não está ativo.', 409);
        }
        if (novosUsosAnteriores < 0) {
            throw new AppError(
                'usosAnteriores deve ser maior ou igual a zero.',
                400,
            );
        }
        if (novosUsosAnteriores >= saldo.quantidadeTotal) {
            throw new AppError(
                'usosAnteriores deve ser menor que a quantidade total do serviço.',
                400,
            );
        }

        const agendamentosOcupados = await tx.agendamento.count({
            where: {
                pacoteClienteId,
                servicoId,
                status: { not: StatusAgendamento.CANCELADO },
                numeroNoPacote: { lte: novosUsosAnteriores },
            },
        });
        if (agendamentosOcupados > 0) {
            throw new AppError(
                'Não é possível definir usosAnteriores: existe agendamento não cancelado ocupando número afetado.',
                409,
            );
        }

        const novaQuantidadeRestante =
            saldo.quantidadeRestante +
            saldo.usosAnteriores -
            novosUsosAnteriores;
        if (
            novaQuantidadeRestante < 0 ||
            novaQuantidadeRestante > saldo.quantidadeTotal - novosUsosAnteriores
        ) {
            throw new AppError(
                'A alteração de usosAnteriores produziria saldo inválido.',
                409,
            );
        }

        await tx.pacoteClienteServico.update({
            where: { id: saldo.id },
            data: {
                usosAnteriores: novosUsosAnteriores,
                quantidadeRestante: novaQuantidadeRestante,
            },
        });

        return atualizarStatusConformeSaldos(tx, pacoteClienteId);
    });
}

export async function buscarPorId(
    id: string,
): Promise<AgendamentoComRelacoes | null> {
    try {
        return await prisma.agendamento.findUnique({
            where: { id },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function buscarConflito(
    params: BuscarConflitoParams,
): Promise<AgendamentoComRelacoes | null> {
    try {
        return await prisma.agendamento.findFirst({
            where: {
                status: { not: StatusAgendamento.CANCELADO },
                dataHoraInicio: { lt: params.dataHoraFim },
                dataHoraFim: { gt: params.dataHoraInicio },
                ...(params.ignorarAgendamentoId
                    ? { id: { not: params.ignorarAgendamentoId } }
                    : {}),
            },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function atualizar(
    id: string,
    data: SalvarAgendamentoData,
): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.update({
            where: { id },
            data,
            include: includeRelacoes,
        });
    } catch (error) {
        if (isViolacaoDeSobreposicao(error)) {
            throw new AppError('Já existe um agendamento nesse horário.', 409);
        }

        throw error;
    }
}

export async function atualizarComNumeroNoPacote(
    id: string,
    data: SalvarAgendamentoData,
    pacoteClienteId: string | null,
    servicoId: string,
    numeroNoPacoteAtual: number | null,
    statusAtual: StatusAgendamento,
): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.$transaction(async (tx) => {
            let numeroNoPacote: number | null = null;

            if (
                pacoteClienteId &&
                data.status !== StatusAgendamento.CANCELADO
            ) {
                const podeManterNumero =
                    servicoId === data.servicoId &&
                    statusAtual !== StatusAgendamento.CANCELADO &&
                    numeroNoPacoteAtual !== null;

                numeroNoPacote = podeManterNumero
                    ? numeroNoPacoteAtual
                    : await reservarNumeroNoPacote(
                          tx,
                          pacoteClienteId,
                          data.servicoId,
                          id,
                      );
            }

            return tx.agendamento.update({
                where: { id },
                data: { ...data, numeroNoPacote },
                include: includeRelacoes,
            });
        });
    } catch (error) {
        if (isViolacaoDeSobreposicao(error)) {
            throw new AppError('Já existe um agendamento nesse horário.', 409);
        }

        throw error;
    }
}

export async function cancelar(id: string): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.update({
            where: { id },
            data: {
                status: StatusAgendamento.CANCELADO,
                numeroNoPacote: null,
            },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function listarSiblingsEditaveisDoLote(
    loteId: string,
    ignorarAgendamentoId: string,
): Promise<AgendamentoComRelacoes[]> {
    try {
        return await prisma.agendamento.findMany({
            where: {
                loteId,
                id: { not: ignorarAgendamentoId },
                status: {
                    notIn: [
                        StatusAgendamento.CONCLUIDO,
                        StatusAgendamento.CANCELADO,
                    ],
                },
            },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
}

export async function atualizarPacoteClienteId(
    id: string,
    pacoteClienteId: string | null,
): Promise<AgendamentoComRelacoes> {
    return prisma.$transaction(async (tx) => {
        const atual = await tx.agendamento.findUnique({
            where: { id },
            select: {
                pacoteClienteId: true,
                servicoId: true,
                status: true,
                numeroNoPacote: true,
            },
        });

        if (!atual) {
            throw new AppError('Agendamento não encontrado.', 404);
        }

        const numeroNoPacote = pacoteClienteId
            ? atual.pacoteClienteId === pacoteClienteId &&
              atual.status !== StatusAgendamento.CANCELADO &&
              atual.numeroNoPacote !== null
                ? atual.numeroNoPacote
                : await reservarNumeroNoPacote(
                      tx,
                      pacoteClienteId,
                      atual.servicoId,
                      id,
                  )
            : null;

        return tx.agendamento.update({
            where: { id },
            data: { pacoteClienteId, numeroNoPacote },
            include: includeRelacoes,
        });
    });
}

export async function contarAtivosPorClienteId(id: string): Promise<number> {
    try {
        return await prisma.agendamento.count({
            where: {
                clienteId: id,
                status: { not: StatusAgendamento.CANCELADO },
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function contarAtivosPorServicoId(id: string): Promise<number> {
    try {
        return await prisma.agendamento.count({
            where: {
                servicoId: id,
                status: { not: StatusAgendamento.CANCELADO },
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function excluirCanceladosPorClienteId(id: string): Promise<void> {
    try {
        await prisma.agendamento.deleteMany({
            where: {
                clienteId: id,
                status: StatusAgendamento.CANCELADO,
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function excluirCanceladosPorServicoId(id: string): Promise<void> {
    try {
        await prisma.agendamento.deleteMany({
            where: {
                servicoId: id,
                status: StatusAgendamento.CANCELADO,
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function contarPendentesPorPacoteClienteId(
    pacoteClienteId: string,
    apartirDe: Date,
): Promise<number> {
    try {
        return await prisma.agendamento.count({
            where: {
                pacoteClienteId,
                concluido: false,
                status: { not: StatusAgendamento.CANCELADO },
                dataHoraInicio: { gte: apartirDe },
            },
        });
    } catch (error) {
        throw error;
    }
}

export async function concluirComPacote(
    agendamentoId: string,
    pacoteClienteId: string,
    servicoId: string,
): Promise<{
    agendamento: AgendamentoComRelacoes;
    pacoteCliente: PacoteCliente;
}> {
    return prisma.$transaction(async (tx) => {
        const saldo = await tx.pacoteClienteServico.updateMany({
            where: {
                pacoteClienteId,
                servicoId,
                quantidadeRestante: { gt: 0 },
            },
            data: { quantidadeRestante: { decrement: 1 } },
        });

        if (saldo.count === 0) {
            const saldoExistente = await tx.pacoteClienteServico.findUnique({
                where: {
                    pacoteClienteId_servicoId: {
                        pacoteClienteId,
                        servicoId,
                    },
                },
                select: { id: true },
            });

            throw new AppError(
                saldoExistente
                    ? 'Pacote do cliente está esgotado.'
                    : 'Pacote do cliente não encontrado.',
                saldoExistente ? 400 : 404,
            );
        }

        const pacoteClienteAtualizado = await atualizarStatusConformeSaldos(
            tx,
            pacoteClienteId,
        );

        const agendamento = await tx.agendamento.update({
            where: { id: agendamentoId },
            data: { concluido: true },
            include: includeRelacoes,
        });

        return { agendamento, pacoteCliente: pacoteClienteAtualizado };
    });
}
