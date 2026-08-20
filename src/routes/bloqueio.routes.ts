import { FastifyInstance } from 'fastify';
import * as bloqueioController from '../controllers/bloqueio.controller';

export async function bloqueioRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/bloqueios',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['dataHoraInicio', 'dataHoraFim', 'motivo'],
                    additionalProperties: false,
                    properties: {
                        dataHoraInicio: { type: 'string', format: 'date-time' },
                        dataHoraFim: { type: 'string', format: 'date-time' },
                        motivo: {
                            type: 'string',
                            minLength: 1,
                            maxLength: 120,
                        },
                    },
                },
            },
        },
        bloqueioController.criar,
    );

    app.get(
        '/bloqueios',
        {
            schema: {
                querystring: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        data: {
                            type: 'string',
                            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
                        },
                    },
                },
            },
        },
        bloqueioController.listarTodos,
    );

    app.delete(
        '/bloqueios/:id',
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
        bloqueioController.excluir,
    );
}
