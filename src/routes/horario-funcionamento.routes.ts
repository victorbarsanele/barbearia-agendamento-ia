import { FastifyInstance } from 'fastify';
import * as horarioFuncionamentoController from '../controllers/horario-funcionamento.controller';

const configuracaoSchema = {
    anyOf: [
        { type: 'null' },
        {
            type: 'object',
            required: [
                'diaSemana',
                'horaAberturaMinutos',
                'horaFechamentoMinutos',
                'almocoInicioMinutos',
                'almocoFimMinutos',
                'limiteExtensaoMinutos',
                'ultimoInicioExtensaoMinutos',
            ],
            additionalProperties: false,
            properties: {
                diaSemana: { type: 'integer', minimum: 0, maximum: 6 },
                horaAberturaMinutos: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 1440,
                },
                horaFechamentoMinutos: {
                    type: 'integer',
                    minimum: 0,
                    maximum: 1440,
                },
                almocoInicioMinutos: {
                    anyOf: [
                        { type: 'null' },
                        { type: 'integer', minimum: 0, maximum: 1440 },
                    ],
                },
                almocoFimMinutos: {
                    anyOf: [
                        { type: 'null' },
                        { type: 'integer', minimum: 0, maximum: 1440 },
                    ],
                },
                limiteExtensaoMinutos: {
                    anyOf: [
                        { type: 'null' },
                        { type: 'integer', minimum: 0, maximum: 1440 },
                    ],
                },
                ultimoInicioExtensaoMinutos: {
                    anyOf: [
                        { type: 'null' },
                        { type: 'integer', minimum: 0, maximum: 1440 },
                    ],
                },
            },
        },
    ],
} as const;

export async function horarioFuncionamentoRoutes(
    app: FastifyInstance,
): Promise<void> {
    app.get('/horarios-funcionamento', horarioFuncionamentoController.listar);
    app.put(
        '/horarios-funcionamento',
        {
            schema: {
                body: {
                    type: 'array',
                    minItems: 7,
                    maxItems: 7,
                    items: configuracaoSchema,
                },
            },
        },
        horarioFuncionamentoController.atualizar,
    );
}
