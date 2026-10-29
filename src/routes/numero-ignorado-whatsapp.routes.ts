import { FastifyInstance } from 'fastify';
import * as numeroIgnoradoController from '../controllers/numero-ignorado-whatsapp.controller';

export async function numeroIgnoradoWhatsAppRoutes(
    app: FastifyInstance,
): Promise<void> {
    app.get(
        '/numeros-ignorados',
        {
            schema: {
                querystring: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {},
                },
            },
        },
        numeroIgnoradoController.listar,
    );

    app.post(
        '/numeros-ignorados',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['telefone', 'rotulo'],
                    additionalProperties: false,
                    properties: {
                        telefone: {
                            type: 'string',
                            minLength: 1,
                            maxLength: 40,
                        },
                        rotulo: { type: 'string', minLength: 1, maxLength: 60 },
                        confirmarMesmoSendoCliente: { type: 'boolean' },
                    },
                },
            },
        },
        numeroIgnoradoController.criar,
    );

    app.delete(
        '/numeros-ignorados/:id',
        {
            schema: {
                params: {
                    type: 'object',
                    required: ['id'],
                    additionalProperties: false,
                    properties: { id: { type: 'string', minLength: 1 } },
                },
            },
        },
        numeroIgnoradoController.excluir,
    );
}
