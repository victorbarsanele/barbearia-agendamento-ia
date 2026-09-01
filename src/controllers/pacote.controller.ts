import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as pacoteService from '../services/pacote.service';

interface CriarPacoteBody {
    nome: string;
    duracaoDias: number;
    quantidade: number;
    servicoIds: string[];
}

interface AtualizarPacoteBody {
    nome: string;
    duracaoDias: number;
    quantidade: number;
    servicoIds: string[];
}

interface PacoteParams {
    id: string;
}

interface VincularPacoteBody {
    clienteId: string;
    pacoteId: string;
}

interface ClienteParams {
    clienteId: string;
}

interface PacoteClienteParams {
    pacoteClienteId: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
    } else {
        void reply.status(500).send({ message: 'Erro interno do servidor.' });
    }
}

export async function criar(
    request: FastifyRequest<{ Body: CriarPacoteBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacote = await pacoteService.criar(request.body);
        void reply.status(201).send(pacote);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function listarTodos(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacotes = await pacoteService.listarTodos();
        void reply.send(pacotes);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorId(
    request: FastifyRequest<{ Params: PacoteParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacote = await pacoteService.buscarPorId(request.params.id);
        void reply.send(pacote);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function atualizar(
    request: FastifyRequest<{
        Params: PacoteParams;
        Body: AtualizarPacoteBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacote = await pacoteService.atualizar(
            request.params.id,
            request.body,
        );
        void reply.send(pacote);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function excluir(
    request: FastifyRequest<{ Params: PacoteParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        await pacoteService.excluirPorId(request.params.id);
        void reply.status(204).send();
    } catch (error) {
        handleError(error, reply);
    }
}

export async function vincular(
    request: FastifyRequest<{ Body: VincularPacoteBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacoteCliente = await pacoteService.vincularCliente(request.body);
        void reply.status(201).send(pacoteCliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarAtivoPorCliente(
    request: FastifyRequest<{ Params: ClienteParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacoteCliente = await pacoteService.buscarAtivoPorCliente(
            request.params.clienteId,
        );
        void reply.send(pacoteCliente);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function desvincular(
    request: FastifyRequest<{ Params: PacoteClienteParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const pacoteCliente = await pacoteService.desvincularCliente(
            request.params.pacoteClienteId,
        );
        void reply.send(pacoteCliente);
    } catch (error) {
        handleError(error, reply);
    }
}
