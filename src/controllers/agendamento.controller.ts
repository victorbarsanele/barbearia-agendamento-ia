import { StatusAgendamento } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/app-error';
import * as agendamentoService from '../services/agendamento.service';

interface CriarAgendamentoBody {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    dataHoraInicio: string;
}

interface AtualizarAgendamentoBody {
    clienteId: string;
    servicoId: string;
    dataHoraInicio: string;
    status: StatusAgendamento;
    notificarCliente?: boolean;
}

interface CancelarAgendamentoBody {
    notificarCliente?: boolean;
    aplicarParaLote?: boolean;
}

interface VincularPacoteBody {
    pacoteClienteId: string;
}

interface AgendamentoParams {
    id: string;
}

interface SlotLoteBody {
    data: string;
    horario: string;
}

interface SimularLoteBody {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    slots: SlotLoteBody[];
}

interface CriarLoteBody {
    clienteId: string;
    servicoId: string;
    pacoteClienteId?: string;
    slots: SlotLoteBody[];
}

interface ConcluirAgendamentoBody {
    aplicarParaLote?: boolean;
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
    request: FastifyRequest<{
        Params: AgendamentoParams;
        Body: CancelarAgendamentoBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.cancelar(
            request.params.id,
            request.body?.notificarCliente === true,
            request.body?.aplicarParaLote === true,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function concluir(
    request: FastifyRequest<{
        Params: AgendamentoParams;
        Body: ConcluirAgendamentoBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.concluir(
            request.params.id,
            request.body?.aplicarParaLote === true,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function simularLote(
    request: FastifyRequest<{ Body: SimularLoteBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const resultado = await agendamentoService.simularLote(request.body);
        void reply.send(resultado);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function criarLote(
    request: FastifyRequest<{ Body: CriarLoteBody }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const resultado = await agendamentoService.criarLote(request.body);
        void reply.status(201).send(resultado);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function vincularPacote(
    request: FastifyRequest<{
        Params: AgendamentoParams;
        Body: VincularPacoteBody;
    }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.vincularPacote(
            request.params.id,
            request.body.pacoteClienteId,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}

export async function desvincularPacote(
    request: FastifyRequest<{ Params: AgendamentoParams }>,
    reply: FastifyReply,
): Promise<void> {
    try {
        const agendamento = await agendamentoService.desvincularPacote(
            request.params.id,
        );
        void reply.send(agendamento);
    } catch (error) {
        handleError(error, reply);
    }
}
