import { FastifyInstance } from 'fastify';
import * as configuracaoAgendamentoController from '../controllers/configuracao-agendamento.controller';

const respostaConfiguracaoSchema = {
    type: 'object',
    required: ['minAntecedenciaMinutos'],
    additionalProperties: false,
    properties: {
        minAntecedenciaMinutos: {
            type: 'integer',
            minimum: 0,
            maximum: 1440,
        },
    },
} as const;

export async function configuracaoAgendamentoRoutes(
    app: FastifyInstance,
): Promise<void> {
    app.get(
        '/configuracao-agendamento',
        {
            schema: {
                response: {
                    200: respostaConfiguracaoSchema,
                },
            },
        },
        configuracaoAgendamentoController.obter,
    );
}
