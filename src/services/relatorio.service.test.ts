import { OrigemAgendamento, Prisma, StatusAgendamento } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = vi.hoisted(() => ({
    agregarAtendimentos: vi.fn(),
    agruparAgendamentosPorOrigem: vi.fn(),
    listarClientesInativos: vi.fn(),
    listarSaldoPacotes: vi.fn(),
}));

const numeroIgnoradoMock = vi.hoisted(() => ({
    listar: vi.fn(),
}));

const reativacaoRepositoryMock = vi.hoisted(() => ({
    buscarResumoReativacoesPorClientes: vi.fn(),
}));

vi.mock('../repositories/relatorio.repository', () => repositoryMock);
vi.mock('../repositories/reativacao.repository', () => ({
    getReativacaoRepository: () => reativacaoRepositoryMock,
}));
vi.mock('./numero-ignorado-whatsapp.service', () => numeroIgnoradoMock);

import * as relatorioRepository from '../repositories/relatorio.repository';
import * as numeroIgnoradoWhatsAppService from './numero-ignorado-whatsapp.service';
import {
    buscarAtendimentos,
    buscarAgendamentosPorOrigem,
    buscarClientesInativos,
    buscarSaldoPacotes,
} from './relatorio.service';

const agora = new Date('2026-10-11T02:45:00.000Z');

function item(
    servicoId: string,
    valorEstimado: string | null,
    overrides: Partial<{
        quantidade: number;
        quantidadeAvulso: number;
        quantidadePacote: number;
        semPreco: number;
    }> = {},
) {
    return {
        servicoId,
        nome: servicoId,
        quantidade: overrides.quantidade ?? 1,
        quantidadeAvulso: overrides.quantidadeAvulso ?? 1,
        quantidadePacote: overrides.quantidadePacote ?? 0,
        valorEstimado,
        semPreco: overrides.semPreco ?? 0,
    };
}

describe('relatorio.service.buscarAtendimentos', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(relatorioRepository.agregarAtendimentos).mockResolvedValue(
            [],
        );
        vi.mocked(numeroIgnoradoWhatsAppService.listar).mockResolvedValue([]);
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            { total: 0, itens: [] },
        );
        vi.mocked(relatorioRepository.listarSaldoPacotes).mockResolvedValue({
            totalAtivos: 0,
            totalParados: 0,
            total: 0,
            itens: [],
        });
        reativacaoRepositoryMock.buscarResumoReativacoesPorClientes.mockResolvedValue(
            new Map(),
        );
    });

    it.each([
        ['formato inválido', '2026/10/10', '2026-10-10', 'formato'],
        ['data inexistente', '2026-02-31', '2026-03-01', 'data válida'],
        ['início posterior', '2026-10-11', '2026-10-10', 'posterior'],
        ['intervalo acima de 366 dias', '2025-01-01', '2026-01-02', '366'],
    ])('rejeita %s com mensagem clara', async (_cenario, de, ate, trecho) => {
        await expect(buscarAtendimentos(de, ate, agora)).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining(trecho),
        });
        expect(relatorioRepository.agregarAtendimentos).not.toHaveBeenCalled();
    });

    it('calcula total decimal sem erro de ponto flutuante', async () => {
        vi.mocked(relatorioRepository.agregarAtendimentos).mockResolvedValue([
            item('servico-1', new Prisma.Decimal('0.10').toFixed(2)),
            item('servico-2', new Prisma.Decimal('0.20').toFixed(2)),
        ]);

        const resultado = await buscarAtendimentos(
            '2026-10-10',
            '2026-10-10',
            agora,
        );

        expect(resultado.total.valorEstimado).toBe('0.30');
        expect(resultado.geradoEm).toBe(agora.toISOString());
    });

    it('devolve total vazio com quantidade zero e valor nulo', async () => {
        const resultado = await buscarAtendimentos(
            '2026-10-10',
            '2026-10-10',
            agora,
        );

        expect(resultado).toEqual({
            periodo: { de: '2026-10-10', ate: '2026-10-10' },
            geradoEm: agora.toISOString(),
            itens: [],
            total: { quantidade: 0, valorEstimado: null, semPreco: 0 },
        });
    });

    it.each([
        [{ diasMin: 0 }, 'diasMin'],
        [{ diasMin: 366 }, 'diasMin'],
        [{ diasMin: 1.5 }, 'diasMin'],
        [{ diasMax: 1.5 }, 'diasMax'],
        [{ diasMax: 731 }, 'diasMax'],
        [{ diasMin: 40, diasMax: 39 }, 'diasMax'],
        [{ diasMin: 200 }, 'diasMax'],
    ])('rejeita filtro inválido %j', async (filtro, campo) => {
        await expect(
            buscarClientesInativos(filtro, agora),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining(campo),
        });
        expect(numeroIgnoradoWhatsAppService.listar).not.toHaveBeenCalled();
        expect(
            relatorioRepository.listarClientesInativos,
        ).not.toHaveBeenCalled();
    });

    it('monta variantes canônicas com e sem nono dígito', async () => {
        vi.mocked(numeroIgnoradoWhatsAppService.listar).mockResolvedValue([
            { telefone: '+55 (11) 8765-4321' },
            { telefone: '5521976543210' },
            { telefone: 'sem telefone' },
        ] as Awaited<ReturnType<typeof numeroIgnoradoWhatsAppService.listar>>);

        await buscarClientesInativos({}, agora);

        expect(relatorioRepository.listarClientesInativos).toHaveBeenCalledWith(
            agora,
            '2026-10-10',
            30,
            180,
            ['5511987654321', '551187654321', '5521976543210', '552176543210'],
        );
    });

    it('trata lista ignorada vazia e devolve contrato padrão com truncado', async () => {
        const itemInativo = {
            clienteId: 'cliente-1',
            nome: 'Cliente Teste',
            telefone: '5511999999999',
            ultimaVisita: '2026-08-01',
            diasSemVir: 70,
            ultimoServico: 'Corte',
            totalVisitas: 4,
            pacoteAtivoComSaldo: false,
            optOutMarketing: false,
        };
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            { total: 501, itens: [itemInativo] },
        );

        const resultado = await buscarClientesInativos({}, agora);

        expect(relatorioRepository.listarClientesInativos).toHaveBeenCalledWith(
            agora,
            '2026-10-10',
            30,
            180,
            [],
        );
        expect(resultado).toEqual({
            geradoEm: agora.toISOString(),
            filtro: { diasMin: 30, diasMax: 180 },
            total: 501,
            truncado: true,
            itens: [
                {
                    clienteId: itemInativo.clienteId,
                    nome: itemInativo.nome,
                    telefone: itemInativo.telefone,
                    ultimaVisita: itemInativo.ultimaVisita,
                    diasSemVir: itemInativo.diasSemVir,
                    ultimoServico: itemInativo.ultimoServico,
                    totalVisitas: itemInativo.totalVisitas,
                    pacoteAtivoComSaldo: itemInativo.pacoteAtivoComSaldo,
                    ultimaTentativa: null,
                    podeReativar: true,
                    reativacaoBloqueio: null,
                    reativacaoBloqueadaAte: null,
                },
            ],
        });
    });

    it('mantém a última tentativa falha e calcula cooldown pela última não falha', async () => {
        vi.mocked(numeroIgnoradoWhatsAppService.listar).mockResolvedValue([]);
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            {
                total: 1,
                itens: [
                    {
                        clienteId: 'cliente-1',
                        nome: 'Cliente Teste',
                        telefone: '5511999999999',
                        ultimaVisita: '2026-08-01',
                        diasSemVir: 70,
                        ultimoServico: 'Corte',
                        totalVisitas: 4,
                        pacoteAtivoComSaldo: false,
                        optOutMarketing: false,
                    },
                ],
            },
        );
        reativacaoRepositoryMock.buscarResumoReativacoesPorClientes.mockResolvedValue(
            new Map([
                [
                    'cliente-1',
                    {
                        ultimaTentativa: {
                            status: 'FALHOU',
                            criadoEm: new Date('2026-10-10T12:00:00.000Z'),
                        },
                        ultimaNaoFalhada: {
                            status: 'ACEITA',
                            criadoEm: new Date('2026-10-01T12:00:00.000Z'),
                        },
                    },
                ],
            ]),
        );

        const resultado = await buscarClientesInativos({}, agora);

        expect(resultado.itens[0]).toMatchObject({
            ultimaTentativa: {
                status: 'FALHOU',
                criadoEm: '2026-10-10T12:00:00.000Z',
            },
            podeReativar: false,
            reativacaoBloqueio: 'COOLDOWN',
            reativacaoBloqueadaAte: '2026-10-31T12:00:00.000Z',
        });
        expect(
            reativacaoRepositoryMock.buscarResumoReativacoesPorClientes,
        ).toHaveBeenCalledWith(['cliente-1'], agora);
    });

    it('devolve PENDENTE expirado como FALHOU e libera reativação', async () => {
        vi.mocked(numeroIgnoradoWhatsAppService.listar).mockResolvedValue([]);
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            {
                total: 1,
                itens: [
                    {
                        clienteId: 'cliente-1',
                        nome: 'Cliente Teste',
                        telefone: '5511999999999',
                        ultimaVisita: '2026-08-01',
                        diasSemVir: 70,
                        ultimoServico: 'Corte',
                        totalVisitas: 4,
                        pacoteAtivoComSaldo: false,
                        optOutMarketing: false,
                    },
                ],
            },
        );
        const pendenteAntigo = new Date(agora.getTime() - 10 * 60 * 1000 - 1);
        reativacaoRepositoryMock.buscarResumoReativacoesPorClientes.mockResolvedValue(
            new Map([
                [
                    'cliente-1',
                    {
                        ultimaTentativa: {
                            status: 'PENDENTE',
                            criadoEm: pendenteAntigo,
                        },
                        ultimaNaoFalhada: {
                            status: 'PENDENTE',
                            criadoEm: pendenteAntigo,
                        },
                    },
                ],
            ]),
        );

        const resultado = await buscarClientesInativos({}, agora);

        expect(resultado.itens[0]).toMatchObject({
            ultimaTentativa: {
                status: 'FALHOU',
                criadoEm: pendenteAntigo.toISOString(),
            },
            podeReativar: true,
            reativacaoBloqueio: null,
            reativacaoBloqueadaAte: null,
        });
    });

    it('marca opt-out como não reativável mesmo sem cooldown', async () => {
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            {
                total: 1,
                itens: [
                    {
                        clienteId: 'cliente-1',
                        nome: 'Cliente Teste',
                        telefone: '5511999999999',
                        ultimaVisita: '2026-08-01',
                        diasSemVir: 70,
                        ultimoServico: 'Corte',
                        totalVisitas: 4,
                        pacoteAtivoComSaldo: false,
                        optOutMarketing: true,
                    },
                ],
            },
        );

        const resultado = await buscarClientesInativos({}, agora);

        expect(resultado.itens[0]).toMatchObject({
            podeReativar: false,
            reativacaoBloqueio: 'OPT_OUT',
            reativacaoBloqueadaAte: null,
        });
    });

    it('devolve truncado falso quando todos os resultados estão incluídos', async () => {
        vi.mocked(relatorioRepository.listarClientesInativos).mockResolvedValue(
            { total: 0, itens: [] },
        );

        const resultado = await buscarClientesInativos(
            { diasMin: 20, diasMax: 60 },
            agora,
        );

        expect(resultado.filtro).toEqual({ diasMin: 20, diasMax: 60 });
        expect(resultado.truncado).toBe(false);
    });
});

describe('relatorio.service.buscarSaldoPacotes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(relatorioRepository.listarSaldoPacotes).mockResolvedValue({
            totalAtivos: 0,
            totalParados: 0,
            total: 0,
            itens: [],
        });
    });

    it('usa filtros padrão e devolve contrato vazio', async () => {
        const resultado = await buscarSaldoPacotes({}, agora);

        expect(relatorioRepository.listarSaldoPacotes).toHaveBeenCalledWith(
            agora,
            '2026-10-10',
            7,
            false,
        );
        expect(resultado).toEqual({
            geradoEm: agora.toISOString(),
            filtro: { diasParado: 7, somenteParados: false },
            totalAtivos: 0,
            totalParados: 0,
            total: 0,
            truncado: false,
            itens: [],
        });
    });

    it.each([1, 365])('aceita limite diasParado=%i', async (diasParado) => {
        await buscarSaldoPacotes({ diasParado }, agora);

        expect(relatorioRepository.listarSaldoPacotes).toHaveBeenCalledWith(
            agora,
            '2026-10-10',
            diasParado,
            false,
        );
    });

    it.each([0, 366, 1.5, null])(
        'rejeita diasParado=%s',
        async (diasParado) => {
            await expect(
                buscarSaldoPacotes(
                    { diasParado: diasParado as unknown as number },
                    agora,
                ),
            ).rejects.toMatchObject({
                statusCode: 400,
                message: expect.stringContaining('diasParado'),
            });
            expect(
                relatorioRepository.listarSaldoPacotes,
            ).not.toHaveBeenCalled();
        },
    );

    it.each(['true', null])(
        'rejeita somenteParados inválido: %s',
        async (somenteParados) => {
            await expect(
                buscarSaldoPacotes(
                    { somenteParados: somenteParados as unknown as boolean },
                    agora,
                ),
            ).rejects.toMatchObject({
                statusCode: 400,
                message: expect.stringContaining('somenteParados'),
            });
            expect(
                relatorioRepository.listarSaldoPacotes,
            ).not.toHaveBeenCalled();
        },
    );

    it('preserva totais pré-filtro e sinaliza lista truncada', async () => {
        vi.mocked(relatorioRepository.listarSaldoPacotes).mockResolvedValue({
            totalAtivos: 501,
            totalParados: 250,
            total: 501,
            itens: [
                {
                    pacoteClienteId: 'pacote-cliente-1',
                    clienteId: 'cliente-1',
                    nome: 'Cliente',
                    telefone: '5511999999999',
                    pacoteNome: 'Pacote',
                    dataInicio: '2026-10-01',
                    renovadoEm: null,
                    ultimaVisita: null,
                    semVisita: true,
                    diasSemVir: 10,
                    temHorarioMarcado: false,
                    parado: true,
                    totalRestante: 2,
                    totalAgendados: 0,
                    aConcluir: 0,
                    servicos: [
                        {
                            servicoId: 'servico-1',
                            nome: 'Corte',
                            total: 3,
                            restante: 2,
                            agendados: 0,
                        },
                    ],
                },
            ],
        });

        const resultado = await buscarSaldoPacotes(
            { diasParado: 10, somenteParados: true },
            agora,
        );

        expect(resultado).toMatchObject({
            filtro: { diasParado: 10, somenteParados: true },
            totalAtivos: 501,
            totalParados: 250,
            total: 501,
            truncado: true,
            itens: [
                {
                    pacoteClienteId: 'pacote-cliente-1',
                    servicos: [{ servicoId: 'servico-1', restante: 2 }],
                },
            ],
        });
    });
});

describe('relatorio.service.buscarAgendamentosPorOrigem', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(
            relatorioRepository.agruparAgendamentosPorOrigem,
        ).mockResolvedValue([]);
    });

    it('agrega origens e estados, mapeia null e arredonda percentuais', async () => {
        vi.mocked(
            relatorioRepository.agruparAgendamentosPorOrigem,
        ).mockResolvedValue([
            {
                origem: OrigemAgendamento.WHATSAPP_IA,
                status: StatusAgendamento.CANCELADO,
                _count: { _all: 1 },
            },
            {
                origem: null,
                status: StatusAgendamento.CONFIRMADO,
                _count: { _all: 1 },
            },
            {
                origem: OrigemAgendamento.PAINEL,
                status: StatusAgendamento.CONCLUIDO,
                _count: { _all: 2 },
            },
            {
                origem: OrigemAgendamento.WHATSAPP_IA,
                status: StatusAgendamento.AGENDADO,
                _count: { _all: 1 },
            },
            {
                origem: OrigemAgendamento.PAINEL,
                status: StatusAgendamento.CANCELADO,
                _count: { _all: 1 },
            },
        ]);

        const resultado = await buscarAgendamentosPorOrigem(
            '2026-10-10',
            '2026-10-10',
        );

        expect(
            relatorioRepository.agruparAgendamentosPorOrigem,
        ).toHaveBeenCalledWith(
            new Date('2026-10-10T03:00:00.000Z'),
            new Date('2026-10-11T03:00:00.000Z'),
        );
        expect(resultado).toEqual({
            de: '2026-10-10',
            ate: '2026-10-10',
            total: 6,
            origens: [
                {
                    origem: 'WHATSAPP_IA',
                    total: 2,
                    ativos: 1,
                    cancelados: 1,
                    percentual: 33.3,
                },
                {
                    origem: 'PAINEL',
                    total: 3,
                    ativos: 2,
                    cancelados: 1,
                    percentual: 50,
                },
                {
                    origem: 'NAO_INFORMADO',
                    total: 1,
                    ativos: 1,
                    cancelados: 0,
                    percentual: 16.7,
                },
            ],
        });
    });

    it('mantém três origens zeradas e percentuais zero sem registros', async () => {
        const resultado = await buscarAgendamentosPorOrigem(
            '2026-10-10',
            '2026-10-10',
        );

        expect(resultado.total).toBe(0);
        expect(resultado.origens).toEqual([
            {
                origem: 'WHATSAPP_IA',
                total: 0,
                ativos: 0,
                cancelados: 0,
                percentual: 0,
            },
            {
                origem: 'PAINEL',
                total: 0,
                ativos: 0,
                cancelados: 0,
                percentual: 0,
            },
            {
                origem: 'NAO_INFORMADO',
                total: 0,
                ativos: 0,
                cancelados: 0,
                percentual: 0,
            },
        ]);
    });

    it('rejeita intervalo inválido antes de consultar repository', async () => {
        await expect(
            buscarAgendamentosPorOrigem('2026-10-11', '2026-10-10'),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(
            relatorioRepository.agruparAgendamentosPorOrigem,
        ).not.toHaveBeenCalled();
    });
});
