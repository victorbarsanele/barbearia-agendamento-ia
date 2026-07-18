import { FastifyInstance } from 'fastify';
import * as servicoController from '../controllers/servico.controller';

export async function servicoRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/servicos',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['nome', 'duracaoMinutos'],
                    additionalProperties: false,
                    properties: {
                        nome: { type: 'string', minLength: 1 },
                        duracaoMinutos: { type: 'integer', minimum: 1 },
                        preco: {
                            anyOf: [
                                { type: 'number', minimum: 0 },
                                { type: 'null' },
                            ],
                        },
                    },
                },
            },
        },
        servicoController.criar,
    );

    app.get('/servicos', servicoController.listarTodos);

    app.get(
        '/servicos/:id',
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
        servicoController.buscarPorId,
    );

    app.put(
        '/servicos/:id',
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
                    required: ['nome', 'duracaoMinutos'],
                    additionalProperties: false,
                    properties: {
                        nome: { type: 'string', minLength: 1 },
                        duracaoMinutos: { type: 'integer', minimum: 1 },
                        preco: {
                            anyOf: [
                                { type: 'number', minimum: 0 },
                                { type: 'null' },
                            ],
                        },
                    },
                },
            },
        },
        servicoController.atualizar,
    );

    app.delete(
        '/servicos/:id',
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
        servicoController.excluir,
    );
}
