import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMock = vi.hoisted(() => ({
    agregarAtendimentos: vi.fn(),
}));

vi.mock('../repositories/relatorio.repository', () => repositoryMock);

import * as relatorioRepository from '../repositories/relatorio.repository';
import { buscarAtendimentos } from './relatorio.service';

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
});
