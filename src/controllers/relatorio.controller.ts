import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as relatorioService from '../services/relatorio.service';

interface AtendimentosQuery {
    de: string;
    ate: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
    } else {
        void reply.status(500).send({ message: 'Erro interno do servidor.' });
    }
}

export async function listarAtendimentos(
    request: FastifyRequest<{ Querystring: AtendimentosQuery }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const relatorio = await relatorioService.buscarAtendimentos(
            request.query.de,
            request.query.ate,
        );
        void reply.send(relatorio);
    } catch (error) {
        handleError(error, reply);
    }
}
