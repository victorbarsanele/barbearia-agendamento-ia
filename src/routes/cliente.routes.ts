import { FastifyInstance } from 'fastify';
import * as clienteController from '../controllers/cliente.controller';

export async function clienteRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/clientes',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['nome', 'telefone'],
                    additionalProperties: false,
                    properties: {
                        nome: { type: 'string', minLength: 1 },
                        telefone: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        clienteController.criar,
    );

    app.get('/clientes', clienteController.listarTodos);

    app.get(
        '/clientes/:id',
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
        clienteController.buscarPorId,
    );

    app.put(
        '/clientes/:id',
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
                    required: ['nome', 'telefone'],
                    additionalProperties: false,
                    properties: {
                        nome: { type: 'string', minLength: 1 },
                        telefone: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        clienteController.atualizar,
    );

    app.delete(
        '/clientes/:id',
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
        clienteController.excluir,
    );

    app.get(
        '/clientes/telefone/:telefone',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['telefone'],
                    additionalProperties: false,
                    properties: {
                        telefone: { type: 'string', minLength: 1 },
                    },
                },
            },
        },
        clienteController.buscarPorTelefone,
    );
}
