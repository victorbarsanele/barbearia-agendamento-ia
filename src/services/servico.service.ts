import { Servico } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as servicoRepository from '../repositories/servico.repository';

function isForeignKeyConflict(error: unknown): boolean {
    if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
    ) {
        return true;
    }

    if (typeof error !== 'object' || error === null) {
        return false;
    }

    const maybeCode = (error as { code?: unknown }).code;
    const maybeMessage = (error as { message?: unknown }).message;

    if (typeof maybeCode === 'string' && maybeCode === '23503') {
        return true;
    }

    if (
        typeof maybeMessage === 'string' &&
        /foreign key|violates foreign key constraint|constraint/i.test(
            maybeMessage,
        )
    ) {
        return true;
    }

    return false;
}

export async function criar(data: {
    nome: string;
    duracaoMinutos: number;
    preco?: number | null;
}): Promise<Servico> {
    if (data.duracaoMinutos <= 0) {
        throw new AppError(
            'A duração do serviço deve ser maior que zero.',
            400,
        );
    }
    if (data.preco !== undefined && data.preco !== null && data.preco < 0) {
        throw new AppError('O preço do serviço não pode ser negativo.', 400);
    }

    return servicoRepository.criar({
        nome: data.nome,
        duracaoMinutos: data.duracaoMinutos,
        preco: data.preco ?? null,
    });
}

export async function buscarPorId(id: string): Promise<Servico> {
    const servico = await servicoRepository.buscarPorId(id);
    if (!servico) {
        throw new AppError('Servico não encontrado.', 404);
    }

    return servico;
}

export async function atualizar(
    id: string,
    data: { nome: string; duracaoMinutos: number; preco?: number | null },
): Promise<Servico> {
    const servicoExistente = await servicoRepository.buscarPorId(id);
    if (!servicoExistente) {
        throw new AppError('Servico não encontrado.', 404);
    }

    if (data.duracaoMinutos <= 0) {
        throw new AppError(
            'A duração do serviço deve ser maior que zero.',
            400,
        );
    }

    if (data.preco !== undefined && data.preco !== null && data.preco < 0) {
        throw new AppError('O preço do serviço não pode ser negativo.', 400);
    }

    return servicoRepository.atualizar(id, {
        nome: data.nome,
        duracaoMinutos: data.duracaoMinutos,
        preco:
            data.preco !== undefined
                ? data.preco
                : (servicoExistente.preco?.toNumber() ?? null),
    });
}

export async function excluirPorId(id: string): Promise<void> {
    const servicoExistente = await servicoRepository.buscarPorId(id);
    if (!servicoExistente) {
        throw new AppError('Servico não encontrado.', 404);
    }

    const agendamentosAtivos =
        await agendamentoRepository.contarAtivosPorServicoId(id);
    if (agendamentosAtivos > 0) {
        throw new AppError(
            'Não é possível excluir serviço com agendamentos ativos.',
            409,
        );
    }

    await agendamentoRepository.excluirCanceladosPorServicoId(id);

    try {
        await servicoRepository.excluirPorId(id);
    } catch (error) {
        if (isForeignKeyConflict(error)) {
            throw new AppError(
                'Não é possível excluir serviço com agendamentos vinculados.',
                409,
            );
        }

        throw error;
    }
}

export async function listarTodos(): Promise<Servico[]> {
    return servicoRepository.listarTodos();
}
