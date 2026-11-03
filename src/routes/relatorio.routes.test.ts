import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({
    buscarAtendimentos: vi.fn(),
}));

vi.mock('../services/relatorio.service', () => serviceMock);

import * as relatorioService from '../services/relatorio.service';
import { relatorioRoutes } from './relatorio.routes';

describe('GET /relatorios/atendimentos', () => {
    const app = Fastify();

    beforeEach(async () => {
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
});
