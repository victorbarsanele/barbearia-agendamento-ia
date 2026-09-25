import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({
    findMany: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    default: {
        pacote: { findMany },
    },
}));

import { listarLiberadosParaGemini } from './pacote.repository';

describe('pacote.repository.listarLiberadosParaGemini', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('consulta somente pacotes liberados e retorna dados informativos mínimos', async () => {
        findMany.mockResolvedValue([
            {
                nome: 'Pacote liberado',
                preco: { toString: () => '150.00' },
                servicos: [
                    {
                        quantidadeTotal: 3,
                        servico: { nome: 'Corte masculino' },
                    },
                ],
            },
        ]);

        const resultado = await listarLiberadosParaGemini();

        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { liberadoParaGemini: true },
            }),
        );
        expect(resultado).toEqual([
            {
                nome: 'Pacote liberado',
                preco: 150,
                servicos: [{ nome: 'Corte masculino', quantidade: 3 }],
            },
        ]);
        expect(Object.keys(resultado[0])).toEqual([
            'nome',
            'preco',
            'servicos',
        ]);
        expect(Object.keys(resultado[0].servicos[0])).toEqual([
            'nome',
            'quantidade',
        ]);
    });

    it('não retorna pacote com flag falsa', async () => {
        findMany.mockResolvedValue([]);

        await expect(listarLiberadosParaGemini()).resolves.toEqual([]);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { liberadoParaGemini: true },
            }),
        );
    });
});
