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

const respostaOrigemAgendamentosSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['de', 'ate', 'total', 'origens'],
    properties: {
        de: { type: 'string', format: 'date' },
        ate: { type: 'string', format: 'date' },
        total: { type: 'integer', minimum: 0 },
        origens: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'origem',
                    'total',
                    'ativos',
                    'cancelados',
                    'percentual',
                ],
                properties: {
                    origem: {
                        type: 'string',
                        enum: ['WHATSAPP_IA', 'PAINEL', 'NAO_INFORMADO'],
                    },
                    total: { type: 'integer', minimum: 0 },
                    ativos: { type: 'integer', minimum: 0 },
                    cancelados: { type: 'integer', minimum: 0 },
                    percentual: { type: 'number', minimum: 0, maximum: 100 },
                },
            },
        },
    },
};

const respostaClientesInativosSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['geradoEm', 'filtro', 'total', 'truncado', 'itens'],
    properties: {
        geradoEm: { type: 'string', format: 'date-time' },
        filtro: {
            type: 'object',
            additionalProperties: false,
            required: ['diasMin', 'diasMax'],
            properties: {
                diasMin: { type: 'integer', minimum: 1, maximum: 365 },
                diasMax: { type: 'integer', minimum: 1, maximum: 730 },
            },
        },
        total: { type: 'integer', minimum: 0 },
        truncado: { type: 'boolean' },
        itens: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'clienteId',
                    'nome',
                    'telefone',
                    'ultimaVisita',
                    'diasSemVir',
                    'ultimoServico',
                    'totalVisitas',
                    'pacoteAtivoComSaldo',
                    'ultimaTentativa',
                    'podeReativar',
                    'reativacaoBloqueio',
                    'reativacaoBloqueadaAte',
                ],
                properties: {
                    clienteId: { type: 'string' },
                    nome: { type: 'string' },
                    telefone: { type: 'string' },
                    ultimaVisita: { type: 'string', format: 'date' },
                    diasSemVir: { type: 'integer' },
                    ultimoServico: {
                        anyOf: [{ type: 'string' }, { type: 'null' }],
                    },
                    totalVisitas: { type: 'integer', minimum: 1 },
                    pacoteAtivoComSaldo: { type: 'boolean' },
                    ultimaTentativa: {
                        anyOf: [
                            {
                                type: 'object',
                                additionalProperties: false,
                                required: ['status', 'criadoEm'],
                                properties: {
                                    status: { type: 'string' },
                                    criadoEm: {
                                        type: 'string',
                                        format: 'date-time',
                                    },
                                },
                            },
                            { type: 'null' },
                        ],
                    },
                    podeReativar: { type: 'boolean' },
                    reativacaoBloqueio: {
                        anyOf: [
                            { type: 'string', enum: ['OPT_OUT', 'COOLDOWN'] },
                            { type: 'null' },
                        ],
                    },
                    reativacaoBloqueadaAte: {
                        anyOf: [
                            { type: 'string', format: 'date-time' },
                            { type: 'null' },
                        ],
                    },
                },
            },
        },
    },
};

const respostaSaldoPacotesSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'geradoEm',
        'filtro',
        'totalAtivos',
        'totalParados',
        'total',
        'truncado',
        'itens',
    ],
    properties: {
        geradoEm: { type: 'string', format: 'date-time' },
        filtro: {
            type: 'object',
            additionalProperties: false,
            required: ['diasParado', 'somenteParados'],
            properties: {
                diasParado: { type: 'integer', minimum: 1, maximum: 365 },
                somenteParados: { type: 'boolean' },
            },
        },
        totalAtivos: { type: 'integer', minimum: 0 },
        totalParados: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 0 },
        truncado: { type: 'boolean' },
        itens: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'pacoteClienteId',
                    'clienteId',
                    'nome',
                    'telefone',
                    'pacoteNome',
                    'dataInicio',
                    'ultimaVisita',
                    'semVisita',
                    'diasSemVir',
                    'temHorarioMarcado',
                    'parado',
                    'totalRestante',
                    'totalAgendados',
                    'aConcluir',
                    'servicos',
                ],
                properties: {
                    pacoteClienteId: { type: 'string' },
                    clienteId: { type: 'string' },
                    nome: { type: 'string' },
                    telefone: { type: 'string' },
                    pacoteNome: { type: 'string' },
                    dataInicio: { type: 'string', format: 'date' },
                    ultimaVisita: {
                        anyOf: [
                            { type: 'string', format: 'date' },
                            { type: 'null' },
                        ],
                    },
                    semVisita: { type: 'boolean' },
                    diasSemVir: { type: 'integer', minimum: 0 },
                    temHorarioMarcado: { type: 'boolean' },
                    parado: { type: 'boolean' },
                    totalRestante: { type: 'integer' },
                    totalAgendados: { type: 'integer', minimum: 0 },
                    aConcluir: { type: 'integer', minimum: 0 },
                    servicos: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: [
                                'servicoId',
                                'nome',
                                'total',
                                'restante',
                                'agendados',
                            ],
                            properties: {
                                servicoId: { type: 'string' },
                                nome: { type: 'string' },
                                total: { type: 'integer' },
                                restante: { type: 'integer' },
                                agendados: { type: 'integer', minimum: 0 },
                            },
                        },
                    },
                },
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

    app.get(
        '/relatorios/origem-agendamentos',
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
                    200: respostaOrigemAgendamentosSchema,
                },
            },
        },
        relatorioController.listarAgendamentosPorOrigem,
    );

    app.get(
        '/relatorios/clientes-inativos',
        {
            schema: {
                querystring: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        diasMin: { type: 'integer', minimum: 1, maximum: 365 },
                        diasMax: { type: 'integer', minimum: 1, maximum: 730 },
                    },
                },
                response: {
                    200: respostaClientesInativosSchema,
                },
            },
        },
        relatorioController.listarClientesInativos,
    );

    app.get(
        '/relatorios/saldo-pacotes',
        {
            schema: {
                querystring: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        diasParado: {
                            type: 'integer',
                            minimum: 1,
                            maximum: 365,
                        },
                        somenteParados: { type: 'boolean' },
                    },
                },
                response: {
                    200: respostaSaldoPacotesSchema,
                },
            },
        },
        relatorioController.listarSaldoPacotes,
    );
}
