import { StatusAgendamento } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import * as agendamentoController from '../controllers/agendamento.controller';

export async function agendamentoRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/agendamentos',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['clienteId', 'servicoId', 'dataHoraInicio'],
                    additionalProperties: false,
                    properties: {
                        clienteId: { type: 'string', minLength: 1 },
                        servicoId: { type: 'string', minLength: 1 },
                        pacoteClienteId: { type: 'string', minLength: 1 },
                        dataHoraInicio: { type: 'string', format: 'date-time' },
                    },
                },
            },
        },
        agendamentoController.criar,
    );

    app.get('/agendamentos', agendamentoController.listarTodos);

    app.get(
        '/agendamentos/:id',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        agendamentoController.buscarPorId,
    );

    app.put(
        '/agendamentos/:id',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', minLength: 1 },
                    },
                },
                body: {
                    type: 'object',
                    required: [
                        'clienteId',
                        'servicoId',
                        'dataHoraInicio',
                        'status',
                    ],
                    additionalProperties: false,
                    properties: {
                        clienteId: { type: 'string', minLength: 1 },
                        servicoId: { type: 'string', minLength: 1 },
                        dataHoraInicio: { type: 'string', format: 'date-time' },
                        status: {
                            type: 'string',
                            enum: [
                                StatusAgendamento.AGENDADO,
                                StatusAgendamento.CONFIRMADO,
                                StatusAgendamento.CANCELADO,
                                StatusAgendamento.CONCLUIDO,
                            ],
                        },
                        notificarCliente: { type: 'boolean' },
                    },
                },
            },
        },
        agendamentoController.atualizar,
    );

    app.delete(
        '/agendamentos/:id',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', minLength: 1 },
                    },
                },
                body: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        notificarCliente: { type: 'boolean' },
                    },
                },
            },
        },
        agendamentoController.cancelar,
    );

    app.patch(
        '/agendamentos/:id/concluir',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        agendamentoController.concluir,
    );

    app.patch(
        '/agendamentos/:id/pacote',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', minLength: 1 },
                    },
                },
                body: {
                    type: 'object',
                    required: ['pacoteClienteId'],
                    additionalProperties: false,
                    properties: {
                        pacoteClienteId: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        agendamentoController.vincularPacote,
    );

    app.delete(
        '/agendamentos/:id/pacote',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        agendamentoController.desvincularPacote,
    );
}
