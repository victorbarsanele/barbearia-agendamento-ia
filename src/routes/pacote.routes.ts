import { FastifyInstance } from 'fastify';
import * as pacoteController from '../controllers/pacote.controller';

const servicoIdsSchema = {
    type: 'array',
    minItems: 1,
    items: { type: 'string', minLength: 1 },
};

export async function pacoteRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/pacotes',
        {
            schema: {
                body: {
                    type: 'object',
                    required: [
                        'nome',
                        'duracaoDias',
                        'quantidade',
                        'servicoIds',
                    ],
                    additionalProperties: false,
                    properties: {
                        nome: { type: 'string', minLength: 1 },
                        duracaoDias: { type: 'integer', minimum: 1 },
                        quantidade: { type: 'integer', minimum: 1 },
                        servicoIds: servicoIdsSchema,
                    },
                },
            },
        },
        pacoteController.criar,
    );

    app.get('/pacotes', pacoteController.listarTodos);

    app.post(
        '/pacotes/vincular',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['clienteId', 'pacoteId'],
                    additionalProperties: false,
                    properties: {
                        clienteId: { type: 'string', minLength: 1 },
                        pacoteId: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        pacoteController.vincular,
    );

    app.get(
        '/pacotes/cliente/:clienteId',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['clienteId'],
                    additionalProperties: false,
                    properties: {
                        clienteId: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        pacoteController.buscarAtivoPorCliente,
    );

    app.patch(
        '/pacotes/cliente/:pacoteClienteId/desvincular',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['pacoteClienteId'],
                    additionalProperties: false,
                    properties: {
                        pacoteClienteId: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        pacoteController.desvincular,
    );

    app.get(
        '/pacotes/:id',
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
        pacoteController.buscarPorId,
    );

    app.put(
        '/pacotes/:id',
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
                        'nome',
                        'duracaoDias',
                        'quantidade',
                        'servicoIds',
                    ],
                    additionalProperties: false,
                    properties: {
                        nome: { type: 'string', minLength: 1 },
                        duracaoDias: { type: 'integer', minimum: 1 },
                        quantidade: { type: 'integer', minimum: 1 },
                        servicoIds: servicoIdsSchema,
                    },
                },
            },
        },
        pacoteController.atualizar,
    );

    app.delete(
        '/pacotes/:id',
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
        pacoteController.excluir,
    );
}
