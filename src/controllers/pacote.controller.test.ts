import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pacoteServiceMock = vi.hoisted(() => ({
    buscarAtivoPorCliente: vi.fn(),
}));

vi.mock('../services/pacote.service', () => pacoteServiceMock);

import * as pacoteService from '../services/pacote.service';
import { buscarAtivoPorCliente } from './pacote.controller';

describe('pacote.controller.buscarAtivoPorCliente', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('mapeia data de ciclo renovado sem remover campos existentes', async () => {
        const pacoteCliente = {
            id: 'ciclo-novo',
            renovadoDeId: 'ciclo-anterior',
            dataInicio: new Date('2026-03-02T02:30:00.000Z'),
        } as Awaited<ReturnType<typeof pacoteService.buscarAtivoPorCliente>>;
        vi.mocked(pacoteService.buscarAtivoPorCliente).mockResolvedValue(
            pacoteCliente,
        );
        const send = vi.fn();
        const request = {
            params: { clienteId: 'cliente-1' },
        } as FastifyRequest<{ Params: { clienteId: string } }>;

        await buscarAtivoPorCliente(request, {
            send,
        } as unknown as FastifyReply);

        expect(send).toHaveBeenCalledWith({
            ...pacoteCliente,
            renovadoEm: '2026-03-01',
        });
    });

    it('envia renovadoEm nulo para ciclo não renovado', async () => {
        const pacoteCliente = {
            id: 'ciclo-atual',
            renovadoDeId: null,
            dataInicio: new Date('2026-03-02T02:30:00.000Z'),
        } as Awaited<ReturnType<typeof pacoteService.buscarAtivoPorCliente>>;
        vi.mocked(pacoteService.buscarAtivoPorCliente).mockResolvedValue(
            pacoteCliente,
        );
        const send = vi.fn();
        const request = {
            params: { clienteId: 'cliente-1' },
        } as FastifyRequest<{ Params: { clienteId: string } }>;

        await buscarAtivoPorCliente(request, {
            send,
        } as unknown as FastifyReply);

        expect(send).toHaveBeenCalledWith({
            ...pacoteCliente,
            renovadoEm: null,
        });
    });
});
