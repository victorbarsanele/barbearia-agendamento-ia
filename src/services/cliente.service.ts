import { Cliente } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/app-error';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as clienteRepository from '../repositories/cliente.repository';

function normalizarTelefone(telefone: string): string {
    return telefone.replace(/\D/g, '');
}

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
    telefone: string;
}): Promise<Cliente> {
    const telefone = normalizarTelefone(data.telefone);
    const existente = await clienteRepository.buscarPorTelefone(telefone);
    if (existente) {
        throw new AppError('Telefone já cadastrado.', 409);
    }
    return clienteRepository.criar({
        ...data,
        telefone,
    });
}

export async function buscarPorTelefone(telefone: string): Promise<Cliente> {
    const cliente = await clienteRepository.buscarPorTelefone(
        normalizarTelefone(telefone),
    );
    if (!cliente) {
        throw new AppError('Cliente não encontrado.', 404);
    }
    return cliente;
}

export async function buscarPorId(id: string): Promise<Cliente> {
    const cliente = await clienteRepository.buscarPorId(id);
    if (!cliente) {
        throw new AppError('Cliente não encontrado.', 404);
    }
    return cliente;
}

export async function atualizar(
    id: string,
    data: { nome: string; telefone: string },
): Promise<Cliente> {
    const telefone = normalizarTelefone(data.telefone);
    const clienteExistente = await clienteRepository.buscarPorId(id);
    if (!clienteExistente) {
        throw new AppError('Cliente não encontrado.', 404);
    }

    const clienteComTelefone =
        await clienteRepository.buscarPorTelefone(telefone);
    if (clienteComTelefone && clienteComTelefone.id !== id) {
        throw new AppError('Telefone já cadastrado.', 409);
    }

    return clienteRepository.atualizar(id, {
        ...data,
        telefone,
    });
}

export async function excluirPorId(id: string): Promise<void> {
    const clienteExistente = await clienteRepository.buscarPorId(id);
    if (!clienteExistente) {
        throw new AppError('Cliente não encontrado.', 404);
    }

    const agendamentosAtivos =
        await agendamentoRepository.contarAtivosPorClienteId(id);
    if (agendamentosAtivos > 0) {
        throw new AppError(
            'Não é possível excluir cliente com agendamentos ativos.',
            409,
        );
    }

    await agendamentoRepository.excluirCanceladosPorClienteId(id);

    try {
        await clienteRepository.excluirPorId(id);
    } catch (error) {
        if (isForeignKeyConflict(error)) {
            throw new AppError(
                'Não é possível excluir cliente com agendamentos vinculados.',
                409,
            );
        }

        throw error;
    }
}

export async function listarTodos(): Promise<Cliente[]> {
    return clienteRepository.listarTodos();
}

export async function listarPaginado(params: {
    search?: string;
    page: number;
    limit: number;
}): Promise<{
    clientes: Cliente[];
    total: number;
    page: number;
    totalPages: number;
}> {
    const { search, page, limit } = params;
    const skip = (page - 1) * limit;

    const [clientes, total] = await Promise.all([
        clienteRepository.listarPaginado({ search, skip, take: limit }),
        clienteRepository.contar({ search }),
    ]);

    return {
        clientes,
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
}
