import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as numeroIgnoradoService from '../services/numero-ignorado-whatsapp.service';

interface CriarNumeroIgnoradoBody {
    telefone: string;
    rotulo: string;
    confirmarMesmoSendoCliente?: boolean;
}

interface NumeroIgnoradoParams {
    id: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply
            .status(error.statusCode)
            .send({ message: error.message, ...(error.details ?? {}) });
        return;
    }

    void reply.status(500).send({ message: 'Erro interno do servidor.' });
}

export async function listar(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    try {
        void reply.send(await numeroIgnoradoService.listar());
    } catch (error) {
        handleError(error, reply);
    }
}

export async function criar(
    request: FastifyRequest<{ Body: CriarNumeroIgnoradoBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const numero = await numeroIgnoradoService.criar(request.body);
        void reply.status(201).send(numero);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function excluir(
    request: FastifyRequest<{ Params: NumeroIgnoradoParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        await numeroIgnoradoService.excluirPorId(request.params.id);
        void reply.status(204).send();
    } catch (error) {
        handleError(error, reply);
    }
}
