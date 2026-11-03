import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({
    buscarAtendimentos: vi.fn(),
    buscarClientesInativos: vi.fn(),
    buscarSaldoPacotes: vi.fn(),
}));

vi.mock('../services/relatorio.service', () => serviceMock);

import * as relatorioService from '../services/relatorio.service';
import { relatorioRoutes } from './relatorio.routes';

describe('GET /relatorios/atendimentos', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = Fastify();
        vi.clearAllMocks();
        vi.mocked(relatorioService.buscarAtendimentos).mockResolvedValue({
            periodo: { de: '2026-10-10', ate: '2026-10-10' },
            geradoEm: '2026-10-11T02:45:00.000Z',
            itens: [
                {
                    servicoId: 'servico-1',
                    nome: 'Corte',
                    quantidade: 1,
                    quantidadeAvulso: 1,
                    quantidadePacote: 0,
                    valorEstimado: '0.00',
                    semPreco: 0,
                },
                {
                    servicoId: 'servico-2',
                    nome: 'Barba',
                    quantidade: 1,
                    quantidadeAvulso: 1,
                    quantidadePacote: 0,
                    valorEstimado: null,
                    semPreco: 1,
                },
            ],
            total: { quantidade: 2, valorEstimado: '0.00', semPreco: 1 },
        });
        vi.mocked(relatorioService.buscarClientesInativos).mockResolvedValue({
            geradoEm: '2026-10-11T02:45:00.000Z',
            filtro: { diasMin: 30, diasMax: 180 },
            total: 1,
            truncado: false,
            itens: [
                {
                    clienteId: 'cliente-1',
                    nome: 'Cliente Teste',
                    telefone: '5511999999999',
                    ultimaVisita: '2026-08-01',
                    diasSemVir: 70,
                    ultimoServico: 'Corte',
                    totalVisitas: 4,
                    pacoteAtivoComSaldo: true,
                },
            ],
        });
        vi.mocked(relatorioService.buscarSaldoPacotes).mockResolvedValue({
            geradoEm: '2026-10-11T02:45:00.000Z',
            filtro: { diasParado: 7, somenteParados: false },
            totalAtivos: 1,
            totalParados: 1,
            total: 1,
            truncado: false,
            itens: [
                {
                    pacoteClienteId: 'pacote-cliente-1',
                    clienteId: 'cliente-1',
                    nome: 'Cliente Teste',
                    telefone: '+55 (11) 99999-9999',
                    pacoteNome: 'Pacote mensal',
                    dataInicio: '2026-10-01',
                    ultimaVisita: null,
                    semVisita: true,
                    diasSemVir: 10,
                    temHorarioMarcado: false,
                    parado: true,
                    totalRestante: 2,
                    totalAgendados: 1,
                    aConcluir: 0,
                    servicos: [
                        {
                            servicoId: 'servico-1',
                            nome: 'Corte',
                            total: 3,
                            restante: 2,
                            agendados: 1,
                        },
                    ],
                },
            ],
        });
        await app.register(relatorioRoutes);
    });

    afterEach(async () => {
        await app.close();
    });

    it('valida e serializa contrato 200 com valores decimais em string', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/relatorios/atendimentos?de=2026-10-10&ate=2026-10-10',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            itens: [{ valorEstimado: '0.00' }, { valorEstimado: null }],
            total: { valorEstimado: '0.00' },
        });
        expect(relatorioService.buscarAtendimentos).toHaveBeenCalledWith(
            '2026-10-10',
            '2026-10-10',
        );
    });

    it('valida e serializa contrato 200 de clientes inativos', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/relatorios/clientes-inativos',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            geradoEm: '2026-10-11T02:45:00.000Z',
            filtro: { diasMin: 30, diasMax: 180 },
            total: 1,
            truncado: false,
            itens: [
                {
                    telefone: '5511999999999',
                    ultimaVisita: '2026-08-01',
                    pacoteAtivoComSaldo: true,
                },
            ],
        });
        expect(relatorioService.buscarClientesInativos).toHaveBeenCalledWith(
            {},
        );
    });

    it('valida e serializa contrato 200 do saldo de pacotes', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/relatorios/saldo-pacotes',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            geradoEm: '2026-10-11T02:45:00.000Z',
            filtro: { diasParado: 7, somenteParados: false },
            totalAtivos: 1,
            totalParados: 1,
            total: 1,
            truncado: false,
            itens: [
                {
                    telefone: '+55 (11) 99999-9999',
                    ultimaVisita: null,
                    semVisita: true,
                    servicos: [{ total: 3, restante: 2, agendados: 1 }],
                },
            ],
        });
        expect(relatorioService.buscarSaldoPacotes).toHaveBeenCalledWith({});
    });

    it('converte query string para tipos do contrato', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/relatorios/saldo-pacotes?diasParado=365&somenteParados=true',
        });

        expect(response.statusCode).toBe(200);
        expect(relatorioService.buscarSaldoPacotes).toHaveBeenCalledWith({
            diasParado: 365,
            somenteParados: true,
        });
    });

    it.each([
        'diasParado=0',
        'diasParado=366',
        'diasParado=1.5',
        'somenteParados=sim',
    ])('rejeita query inválida: %s', async (query) => {
        const response = await app.inject({
            method: 'GET',
            url: `/relatorios/saldo-pacotes?${query}`,
        });

        expect(response.statusCode).toBe(400);
        expect(relatorioService.buscarSaldoPacotes).not.toHaveBeenCalled();
    });
});
