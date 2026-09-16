import { FastifyInstance } from 'fastify';
import * as bloqueioController from '../controllers/bloqueio.controller';

export async function bloqueioRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/bloqueios',
        {
            schema: {
                body: {
                    type: 'object',
                    required: ['motivo'],
                    additionalProperties: false,
                    properties: {
                        dataHoraInicio: { type: 'string', format: 'date-time' },
                        dataHoraFim: { type: 'string', format: 'date-time' },
                        motivo: {
                            type: 'string',
                            minLength: 1,
                            maxLength: 120,
                        },
                        escopo: {
                            type: 'string',
                            enum: ['TODOS', 'SO_PAINEL'],
                        },
                        recorrencia: {
                            type: 'string',
                            enum: ['PONTUAL', 'SEMANAL'],
                        },
                        diaSemana: { type: 'integer', minimum: 1, maximum: 6 },
                        horaInicioMinutos: {
                            type: 'integer',
                            minimum: 0,
                            maximum: 1439,
                        },
                        horaFimMinutos: {
                            type: 'integer',
                            minimum: 1,
                            maximum: 1440,
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
