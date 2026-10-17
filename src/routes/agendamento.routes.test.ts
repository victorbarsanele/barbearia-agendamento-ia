import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';

const serviceMocks = vi.hoisted(() => ({
    criar: vi.fn(),
    listarTodos: vi.fn(),
    buscarPorId: vi.fn(),
    atualizar: vi.fn(),
    cancelar: vi.fn(),
    concluir: vi.fn(),
    simularLote: vi.fn(),
    criarLote: vi.fn(),
    vincularPacote: vi.fn(),
    desvincularPacote: vi.fn(),
}));

vi.mock('../services/agendamento.service', () => serviceMocks);

import * as agendamentoService from '../services/agendamento.service';
import { agendamentoRoutes } from './agendamento.routes';

describe('POST /agendamentos', () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(agendamentoService.criar).mockResolvedValue({
            id: 'agendamento-1',
        } as never);
        app = Fastify();
    });

    afterEach(async () => {
        await app.close();
    });

    it('preserva criação sem pacote e define origem do painel', async () => {
        await app.register(agendamentoRoutes);
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos',
            payload: {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                dataHoraInicio: '2026-11-02T10:00:00-03:00',
            },
        });

        expect(response.statusCode).toBe(201);
        expect(agendamentoService.criar).toHaveBeenCalledWith({
            clienteId: 'cliente-1',
            servicoId: 'servico-1',
            pacoteId: undefined,
            pacoteClienteId: undefined,
            dataHoraInicio: '2026-11-02T10:00:00-03:00',
            registroRetroativo: false,
            origem: 'PAINEL',
        });
    });

    it('aceita pacoteId opcional e encaminha ao serviço', async () => {
        await app.register(agendamentoRoutes);
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos',
            payload: {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                pacoteId: 'cuid-pacote-1',
                dataHoraInicio: '2026-11-02T10:00:00-03:00',
            },
        });

        expect(response.statusCode).toBe(201);
        expect(agendamentoService.criar).toHaveBeenCalledWith(
            expect.objectContaining({ pacoteId: 'cuid-pacote-1' }),
        );
    });

    it('descarta campos fora da whitelist', async () => {
        await app.register(agendamentoRoutes);
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos',
            payload: {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                pacoteId: 'cuid-pacote-1',
                usosAnteriores: 1,
                dataHoraInicio: '2026-11-02T10:00:00-03:00',
            },
        });

        expect(response.statusCode).toBe(201);
        expect(agendamentoService.criar).toHaveBeenCalledOnce();
        expect(
            vi.mocked(agendamentoService.criar).mock.calls[0]?.[0],
        ).not.toHaveProperty('usosAnteriores');
    });
});

describe('POST /agendamentos/lote', () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(agendamentoService.simularLote).mockResolvedValue({
            disponiveis: [],
            conflitos: [],
        } as never);
        vi.mocked(agendamentoService.criarLote).mockResolvedValue({
            loteId: 'lote-1',
            criados: [],
            falhados: [],
        } as never);
        app = Fastify();
    });

    afterEach(async () => {
        await app.close();
    });

    it.each([
        ['/agendamentos/lote/simular', 'simularLote'],
        ['/agendamentos/lote', 'criarLote'],
    ] as const)(
        'aceita pacoteId em %s e fixa origem PAINEL',
        async (url, method) => {
            await app.register(agendamentoRoutes);
            const response = await app.inject({
                method: 'POST',
                url,
                payload: {
                    clienteId: 'cliente-1',
                    servicoId: 'servico-1',
                    pacoteId: 'pacote-1',
                    slots: [{ data: '2026-11-02', horario: '10:00' }],
                },
            });

            expect(response.statusCode).toBe(
                url.endsWith('/simular') ? 200 : 201,
            );
            expect(agendamentoService[method]).toHaveBeenCalledWith(
                expect.objectContaining({
                    pacoteId: 'pacote-1',
                    origem: 'PAINEL',
                }),
            );
        },
    );

    it.each([
        ['/agendamentos/lote/simular', 'simularLote'],
        ['/agendamentos/lote', 'criarLote'],
    ] as const)('preserva payload sem pacote em %s', async (url, method) => {
        await app.register(agendamentoRoutes);
        const response = await app.inject({
            method: 'POST',
            url,
            payload: {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                slots: [{ data: '2026-11-02', horario: '10:00' }],
            },
        });

        expect(response.statusCode).toBe(url.endsWith('/simular') ? 200 : 201);
        expect(agendamentoService[method]).toHaveBeenCalledWith(
            expect.objectContaining({ origem: 'PAINEL' }),
        );
        expect(agendamentoService[method]).not.toHaveBeenCalledWith(
            expect.objectContaining({ pacoteId: expect.anything() }),
        );
    });

    it.each(['/agendamentos/lote/simular', '/agendamentos/lote'])(
        'rejeita pacoteId e pacoteClienteId simultâneos em %s',
        async (url) => {
            await app.register(agendamentoRoutes);
            const response = await app.inject({
                method: 'POST',
                url,
                payload: {
                    clienteId: 'cliente-1',
                    servicoId: 'servico-1',
                    pacoteId: 'pacote-1',
                    pacoteClienteId: 'pacote-cliente-1',
                    slots: [{ data: '2026-11-02', horario: '10:00' }],
                },
            });

            expect(response.statusCode).toBe(400);
            expect(agendamentoService.simularLote).not.toHaveBeenCalled();
            expect(agendamentoService.criarLote).not.toHaveBeenCalled();
        },
    );

    it('serializa detalhes do erro atômico sem campos quando ausentes', async () => {
        await app.register(agendamentoRoutes);
        vi.mocked(agendamentoService.criarLote).mockRejectedValue(
            new AppError('Horário indisponível.', 409, {
                slot: { data: '2026-11-02', horario: '10:00' },
                motivo: 'conflito_horario',
            }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos/lote',
            payload: {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                pacoteId: 'pacote-1',
                slots: [{ data: '2026-11-02', horario: '10:00' }],
            },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({
            message: 'Horário indisponível.',
            slot: { data: '2026-11-02', horario: '10:00' },
            motivo: 'conflito_horario',
        });
    });
});
