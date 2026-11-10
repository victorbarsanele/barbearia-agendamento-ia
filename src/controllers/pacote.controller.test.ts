import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';

const pacoteServiceMock = vi.hoisted(() => ({
    buscarAtivoPorCliente: vi.fn(),
    listarTodos: vi.fn(),
    arquivarPorId: vi.fn(),
}));

vi.mock('../services/pacote.service', () => pacoteServiceMock);

import * as pacoteService from '../services/pacote.service';
import {
    arquivar,
    buscarAtivoPorCliente,
    listarTodos,
} from './pacote.controller';

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

describe('pacote.controller catálogo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('encaminha filtro de situação para a listagem', async () => {
        const request = {
            query: { situacao: 'arquivados' },
        } as FastifyRequest<{ Querystring: { situacao: 'arquivados' } }>;
        const send = vi.fn();
        vi.mocked(pacoteService.listarTodos).mockResolvedValue([]);

        await listarTodos(request, { send } as unknown as FastifyReply);

        expect(pacoteService.listarTodos).toHaveBeenCalledWith('arquivados');
        expect(send).toHaveBeenCalledWith([]);
    });

    it('propaga código de erro de pacote no corpo da resposta', async () => {
        const status = vi.fn().mockReturnThis();
        const send = vi.fn();
        vi.mocked(pacoteService.arquivarPorId).mockRejectedValue(
            new AppError('Pacote já arquivado.', 409, {
                code: 'PACOTE_ARQUIVADO',
            }),
        );

        await arquivar(
            { params: { id: 'pacote-1' } } as FastifyRequest<{
                Params: { id: string };
            }>,
            { status, send } as unknown as FastifyReply,
        );

        expect(status).toHaveBeenCalledWith(409);
        expect(send).toHaveBeenCalledWith({
            message: 'Pacote já arquivado.',
            code: 'PACOTE_ARQUIVADO',
        });
    });
});
