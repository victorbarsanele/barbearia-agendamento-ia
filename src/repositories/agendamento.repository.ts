import {
    PacoteCliente,
    Prisma,
    StatusAgendamento,
    StatusPacoteCliente,
} from '@prisma/client';
import { AppError } from '../lib/app-error';
import prisma from '../lib/prisma';

export type AgendamentoComRelacoes = Prisma.AgendamentoGetPayload<{
    include: {
        cliente: true;
        servico: true;
    };
}>;

interface SalvarAgendamentoData {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string | null;
    dataHoraInicio: Date;
    dataHoraFim: Date;
    status?: StatusAgendamento;
}

interface BuscarConflitoParams {
    dataHoraInicio: Date;
    dataHoraFim: Date;
    ignorarAgendamentoId?: string;
}

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

export async function listarTodos(): Promise<AgendamentoComRelacoes[]> {
    try {
        return await prisma.agendamento.findMany({
            include: includeRelacoes,
            orderBy: { dataHoraInicio: 'asc' },
        });
    } catch (error) {
        throw error;
    }
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

export async function cancelar(id: string): Promise<AgendamentoComRelacoes> {
    try {
        return await prisma.agendamento.update({
            where: { id },
            data: { status: StatusAgendamento.CANCELADO },
            include: includeRelacoes,
        });
    } catch (error) {
        throw error;
    }
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
): Promise<{
    agendamento: AgendamentoComRelacoes;
    pacoteCliente: PacoteCliente;
}> {
    return prisma.$transaction(async (tx) => {
        const pacoteCliente = await tx.pacoteCliente.findUnique({
            where: { id: pacoteClienteId },
        });

        if (!pacoteCliente) {
            throw new AppError('Pacote do cliente não encontrado.', 404);
        }

        const quantidadeRestante = Math.max(
            0,
            pacoteCliente.quantidadeRestante - 1,
        );

        const pacoteClienteAtualizado = await tx.pacoteCliente.update({
            where: { id: pacoteClienteId },
            data: {
                quantidadeRestante,
                status:
                    quantidadeRestante === 0
                        ? StatusPacoteCliente.FINALIZADO
                        : pacoteCliente.status,
            },
        });

        const agendamento = await tx.agendamento.update({
            where: { id: agendamentoId },
            data: { concluido: true },
            include: includeRelacoes,
        });

        return { agendamento, pacoteCliente: pacoteClienteAtualizado };
    });
}
