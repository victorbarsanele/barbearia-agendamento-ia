import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';

const pacoteServiceMock = vi.hoisted(() => ({
    listarTodos: vi.fn(),
    arquivarPorId: vi.fn(),
    desarquivarPorId: vi.fn(),
}));

vi.mock('../services/pacote.service', () => pacoteServiceMock);

import * as pacoteService from '../services/pacote.service';
import { pacoteRoutes } from './pacote.routes';

describe('pacote.routes', () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(async () => {
        vi.clearAllMocks();
        app = Fastify();
        await app.register(pacoteRoutes);
    });

    afterEach(async () => {
        await app.close();
    });

    it('rejeita situacao fora do enum', async () => {
        const response = await app.inject({
            method: 'GET',
            url: '/pacotes?situacao=desconhecida',
        });

        expect(response.statusCode).toBe(400);
        expect(pacoteService.listarTodos).not.toHaveBeenCalled();
    });

    it('retorna 404 ao arquivar pacote inexistente', async () => {
        vi.mocked(pacoteService.arquivarPorId).mockRejectedValueOnce(
            new AppError('Pacote não encontrado.', 404),
        );

        const response = await app.inject({
            method: 'POST',
            url: '/pacotes/pacote-inexistente/arquivar',
        });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ message: 'Pacote não encontrado.' });
    });
});
