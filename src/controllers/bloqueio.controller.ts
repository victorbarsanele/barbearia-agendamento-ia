import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as bloqueioService from '../services/bloqueio.service';

interface CriarBloqueioBody {
    dataHoraInicio: string;
    dataHoraFim: string;
    motivo: string;
}

interface ListarBloqueiosQuery {
    data?: string;
}

interface BloqueioParams {
    id: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
        return;
    }

    void reply.status(500).send({ message: 'Erro interno do servidor.' });
}

export async function criar(
    request: FastifyRequest<{ Body: CriarBloqueioBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const bloqueio = await bloqueioService.criar(request.body);
        void reply.status(201).send(bloqueio);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function listarTodos(
    request: FastifyRequest<{ Querystring: ListarBloqueiosQuery }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const bloqueios = await bloqueioService.listarTodos(request.query.data);
        void reply.send(bloqueios);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function excluir(
    request: FastifyRequest<{ Params: BloqueioParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        await bloqueioService.excluirPorId(request.params.id);
        void reply.status(204).send();
    } catch (error) {
        handleError(error, reply);
    }
}
