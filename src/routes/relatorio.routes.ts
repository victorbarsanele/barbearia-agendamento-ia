import { FastifyInstance } from 'fastify';
import * as relatorioController from '../controllers/relatorio.controller';

const respostaAtendimentosSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['periodo', 'geradoEm', 'itens', 'total'],
    properties: {
        periodo: {
            type: 'object',
            additionalProperties: false,
            required: ['de', 'ate'],
            properties: {
                de: { type: 'string', format: 'date' },
                ate: { type: 'string', format: 'date' },
            },
        },
        geradoEm: { type: 'string', format: 'date-time' },
        itens: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'servicoId',
                    'nome',
                    'quantidade',
                    'quantidadeAvulso',
                    'quantidadePacote',
                    'valorEstimado',
                    'semPreco',
                ],
                properties: {
                    servicoId: { type: 'string' },
                    nome: { type: 'string' },
                    quantidade: { type: 'integer', minimum: 0 },
                    quantidadeAvulso: { type: 'integer', minimum: 0 },
                    quantidadePacote: { type: 'integer', minimum: 0 },
                    valorEstimado: {
                        anyOf: [{ type: 'string' }, { type: 'null' }],
                    },
                    semPreco: { type: 'integer', minimum: 0 },
                },
            },
        },
        total: {
            type: 'object',
            additionalProperties: false,
            required: ['quantidade', 'valorEstimado', 'semPreco'],
            properties: {
                quantidade: { type: 'integer', minimum: 0 },
                valorEstimado: {
                    anyOf: [{ type: 'string' }, { type: 'null' }],
                },
                semPreco: { type: 'integer', minimum: 0 },
            },
        },
    },
};

export async function relatorioRoutes(app: FastifyInstance): Promise<void> {
    app.get(
        '/relatorios/atendimentos',
        {
            schema: {
                querystring: {
                    type: 'object',
                    required: ['de', 'ate'],
                    additionalProperties: false,
                    properties: {
                        de: { type: 'string' },
                        ate: { type: 'string' },
                    },
                },
                response: {
                    200: respostaAtendimentosSchema,
                },
            },
        },
        relatorioController.listarAtendimentos,
    );
}
