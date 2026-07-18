import { StatusAgendamento } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as agendamentoService from '../services/agendamento.service';

interface CriarAgendamentoBody {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
}

interface AtualizarAgendamentoBody {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
    status: StatusAgendamento;
}

interface AgendamentoParams {
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
    request: FastifyRequest<{ Body: CriarAgendamentoBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.criar(request.body);
        void reply.status(201).send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function listarTodos(
    _request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamentos = await agendamentoService.listarTodos();
        void reply.send(agendamentos);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function buscarPorId(
    request: FastifyRequest<{ Params: AgendamentoParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.buscarPorId(
            request.params.id,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function atualizar(
    request: FastifyRequest<{
        Params: AgendamentoParams;
        Body: AtualizarAgendamentoBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.atualizar(
            request.params.id,
            request.body,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function cancelar(
    request: FastifyRequest<{ Params: AgendamentoParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.cancelar(
            request.params.id,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}
