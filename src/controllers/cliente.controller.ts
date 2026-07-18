import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../lib/app-error';
import * as clienteService from '../services/cliente.service';

interface CriarClienteBody {
    nome: string;
    telefone: string;
}

interface AtualizarClienteBody {
    nome: string;
    telefone: string;
}

interface BuscarPorIdParams {
    id: string;
}

interface BuscarPorTelefoneParams {
    telefone: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
    } else {
        void reply.status(500).send({ message: 'Erro interno do servidor.' });
    }
}

export async function criar(
    request: FastifyRequest<{ Body: CriarClienteBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.criar(request.body);
        void reply.status(201).send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function listarTodos(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    try {
        const clientes = await clienteService.listarTodos();
        void reply.send(clientes);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorId(
    request: FastifyRequest<{ Params: BuscarPorIdParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.buscarPorId(request.params.id);
        void reply.send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorTelefone(
    request: FastifyRequest<{ Params: BuscarPorTelefoneParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.buscarPorTelefone(
            request.params.telefone,
        );
        void reply.send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function atualizar(
    request: FastifyRequest<{
        Params: BuscarPorIdParams;
        Body: AtualizarClienteBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const cliente = await clienteService.atualizar(
            request.params.id,
            request.body,
        );
        void reply.send(cliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function excluir(
    request: FastifyRequest<{ Params: BuscarPorIdParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        await clienteService.excluirPorId(request.params.id);
        void reply.status(204).send();
    } catch (error) {
        handleError(error, reply);
    }
}
