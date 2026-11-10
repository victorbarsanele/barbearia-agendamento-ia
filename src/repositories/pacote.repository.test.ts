import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, $transaction } = vi.hoisted(() => ({
    findMany: vi.fn(),
    $transaction: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
    default: {
        $transaction,
        pacote: {
            findMany,
            update: vi.fn(),
            updateMany: vi.fn(),
            findUnique: vi.fn(),
        },
        pacoteCliente: { count: vi.fn() },
        pacoteServico: { deleteMany: vi.fn() },
    },
}));

import prisma from '../lib/prisma';
import {
    arquivarPorId,
    bloquearParaCriacaoNaTransacao,
    desarquivarPorId,
    listarLiberadosParaGemini,
    listarTodos,
} from './pacote.repository';

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
                where: { liberadoParaGemini: true, arquivadoEm: null },
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
                where: { liberadoParaGemini: true, arquivadoEm: null },
            }),
        );
    });

    it('lista situação solicitada e conta somente ciclos ativos', async () => {
        findMany.mockResolvedValue([
            {
                id: 'pacote-1',
                arquivadoEm: null,
                servicos: [],
                _count: { clientes: 2 },
            },
        ]);

        await expect(listarTodos('ativos')).resolves.toMatchObject([
            { id: 'pacote-1', ciclosAtivos: 2 },
        ]);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { arquivadoEm: null } }),
        );

        findMany.mockResolvedValue([]);
        await listarTodos('arquivados');
        expect(findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                where: { arquivadoEm: { not: null } },
            }),
        );
        await listarTodos('todos');
        expect(findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({ where: {} }),
        );
    });

    it('bloqueia pacote para criação com FOR SHARE', async () => {
        const tx = {
            $queryRaw: vi
                .fn()
                .mockResolvedValue([{ id: 'pacote-1', arquivadoEm: null }]),
        };

        await expect(
            bloquearParaCriacaoNaTransacao(tx as never, 'pacote-1'),
        ).resolves.toEqual({ id: 'pacote-1', arquivadoEm: null });
        expect(tx.$queryRaw.mock.calls[0]?.[0].sql).toContain('FOR SHARE');
    });

    it('preserva data do primeiro arquivamento em chamadas repetidas', async () => {
        const arquivadoEm = new Date('2026-11-10T12:00:00Z');
        const tx = {
            $queryRaw: vi
                .fn()
                .mockResolvedValueOnce([{ id: 'pacote-1', arquivadoEm: null }])
                .mockResolvedValueOnce([{ id: 'pacote-1', arquivadoEm }]),
            pacote: {
                update: vi.fn().mockResolvedValue({}),
                findUnique: vi.fn().mockResolvedValue({
                    id: 'pacote-1',
                    arquivadoEm,
                    servicos: [],
                    _count: { clientes: 0 },
                }),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(
            (callback) =>
                (callback as unknown as (transaction: typeof tx) => unknown)(
                    tx,
                ) as never,
        );

        await arquivarPorId('pacote-1');
        await arquivarPorId('pacote-1');

        expect(tx.pacote.update).toHaveBeenCalledTimes(1);
        expect(tx.pacote.findUnique).toHaveBeenCalledTimes(2);
    });

    it('desarquiva por transação e mantém operação idempotente', async () => {
        const tx = {
            $queryRaw: vi
                .fn()
                .mockResolvedValueOnce([{ id: 'pacote-1' }])
                .mockResolvedValueOnce([{ id: 'pacote-1' }]),
            pacote: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                findUnique: vi.fn().mockResolvedValue({
                    id: 'pacote-1',
                    arquivadoEm: null,
                    servicos: [],
                    _count: { clientes: 0 },
                }),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementation(
            (callback) =>
                (callback as unknown as (transaction: typeof tx) => unknown)(
                    tx,
                ) as never,
        );

        await desarquivarPorId('pacote-1');
        await desarquivarPorId('pacote-1');

        expect(tx.pacote.updateMany).toHaveBeenCalledTimes(2);
        expect(tx.pacote.updateMany).toHaveBeenCalledWith({
            where: { id: 'pacote-1', arquivadoEm: { not: null } },
            data: { arquivadoEm: null },
        });
    });
});
