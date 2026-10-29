import { FastifyInstance } from 'fastify';
import * as configuracaoAgendamentoController from '../controllers/configuracao-agendamento.controller';
import {
    HORIZONTE_MAX_DIAS,
    HORIZONTE_PADRAO_DIAS,
} from '../utils/horizonte-agenda';

const respostaConfiguracaoSchema = {
    type: 'object',
    required: [
        'minAntecedenciaMinutos',
        'horizonteDias',
        'limiteAte',
        'horizontePadraoDias',
        'horizonteEfetivo',
        'limiteAtivo',
    ],
    additionalProperties: false,
    properties: {
        minAntecedenciaMinutos: {
            type: 'integer',
            minimum: 0,
            maximum: 1440,
        },
        horizonteDias: {
            type: ['integer', 'null'],
            minimum: 1,
            maximum: HORIZONTE_MAX_DIAS,
        },
        limiteAte: { type: ['string', 'null'], format: 'date' },
        horizontePadraoDias: { type: 'integer', const: HORIZONTE_PADRAO_DIAS },
        horizonteEfetivo: { type: 'string', format: 'date' },
        limiteAtivo: { type: 'boolean' },
    },
} as const;

const horizonteBodySchema = {
    type: 'object',
    required: ['horizonteDias', 'limiteAte'],
    additionalProperties: false,
    properties: {
        horizonteDias: {
            description: `Inteiro entre 1 e ${HORIZONTE_MAX_DIAS}, ou null.`,
        },
        limiteAte: {
            description: 'Data YYYY-MM-DD válida, ou null.',
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
    app.put(
        '/configuracao-agendamento/horizonte',
        {
            schema: {
                body: horizonteBodySchema,
                response: {
                    200: respostaConfiguracaoSchema,
                },
            },
        },
        configuracaoAgendamentoController.definirHorizonte,
    );
}
