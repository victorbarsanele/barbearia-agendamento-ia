import { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../lib/app-error';
import * as servicoService from '../services/servico.service';

interface CriarServicoBody {
    nome: string;
    duracaoMinutos: number;
    preco?: number | null;
}

interface AtualizarServicoBody {
    nome: string;
    duracaoMinutos: number;
    preco?: number | null;
}

interface BuscarServicoPorIdParams {
    id: string;
}

function handleError(error: unknown, reply: FastifyReply): void {
    if (error instanceof AppError) {
        void reply.status(error.statusCode).send({ message: error.message });
    } else {
        void reply.status(500).send({ message: 'Erro interno do servidor.' });
    }
}

export async function criar(
    request: FastifyRequest<{ Body: CriarServicoBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const servico = await servicoService.criar(request.body);
        void reply.status(201).send(servico);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function listarTodos(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    try {
        const servicos = await servicoService.listarTodos();
        void reply.send(servicos);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorId(
    request: FastifyRequest<{ Params: BuscarServicoPorIdParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const servico = await servicoService.buscarPorId(request.params.id);
        void reply.send(servico);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function atualizar(
    request: FastifyRequest<{
        Params: BuscarServicoPorIdParams;
        Body: AtualizarServicoBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const servico = await servicoService.atualizar(
            request.params.id,
            request.body,
        );
        void reply.send(servico);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function excluir(
    request: FastifyRequest<{ Params: BuscarServicoPorIdParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        await servicoService.excluirPorId(request.params.id);
        void reply.status(204).send();
    } catch (error) {
        handleError(error, reply);
    }
}
