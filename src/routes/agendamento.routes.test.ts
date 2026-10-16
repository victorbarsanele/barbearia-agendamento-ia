import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
