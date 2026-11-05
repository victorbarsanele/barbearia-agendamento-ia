import { StatusReativacaoEnvio, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaReativacaoRepository } from './reativacao.repository';

function criarRepository(updateCount: number, existente: boolean) {
    const updateMany = vi.fn().mockResolvedValue({ count: updateCount });
    const findFirst = vi
        .fn()
        .mockResolvedValue(existente ? { id: 'envio-1' } : null);
    const tx = { reativacaoEnvio: { updateMany, findFirst } };
    const prisma = {
        ...tx,
        $transaction: vi.fn(
            async (callback: (client: typeof tx) => Promise<boolean>) =>
                callback(tx),
        ),
    } as unknown as PrismaClient;

    return {
        repository: new PrismaReativacaoRepository(prisma),
        updateMany,
        findFirst,
    };
}

describe('PrismaReativacaoRepository.atualizarStatusPorYCloudMessageId', () => {
    it('permite delivered elevar FALHOU para ENTREGUE', async () => {
        const { repository, updateMany } = criarRepository(1, true);

        await expect(
            repository.atualizarStatusPorYCloudMessageId(
                'ycloud-id-1',
                'ENTREGUE',
                null,
            ),
        ).resolves.toBe(true);

        expect(updateMany).toHaveBeenCalledWith({
            where: {
                ycloudMessageId: 'ycloud-id-1',
                status: {
                    in: [
                        StatusReativacaoEnvio.PENDENTE,
                        StatusReativacaoEnvio.ACEITA,
                        StatusReativacaoEnvio.FALHOU,
                    ],
                },
            },
            data: {
                status: StatusReativacaoEnvio.ENTREGUE,
                motivoFalha: null,
            },
        });
    });

    it('não rebaixa ENTREGUE para FALHOU e reconhece linha existente', async () => {
        const { repository, updateMany, findFirst } = criarRepository(0, true);

        await expect(
            repository.atualizarStatusPorYCloudMessageId(
                'ycloud-id-1',
                'FALHOU',
                '131000: provider error',
            ),
        ).resolves.toBe(true);

        expect(updateMany).toHaveBeenCalledWith({
            where: {
                ycloudMessageId: 'ycloud-id-1',
                status: {
                    in: [
                        StatusReativacaoEnvio.PENDENTE,
                        StatusReativacaoEnvio.ACEITA,
                    ],
                },
            },
            data: {
                status: StatusReativacaoEnvio.FALHOU,
                motivoFalha: '131000: provider error',
            },
        });
        expect(findFirst).toHaveBeenCalledWith({
            where: { ycloudMessageId: 'ycloud-id-1' },
            select: { id: true },
        });
    });

    it('reconhece evento duplicado sem mudar estado terminal', async () => {
        const { repository, updateMany } = criarRepository(0, true);

        await expect(
            repository.atualizarStatusPorYCloudMessageId(
                'ycloud-id-1',
                'ENTREGUE',
                null,
            ),
        ).resolves.toBe(true);
        expect(updateMany).toHaveBeenCalledTimes(1);
    });

    it('retorna false quando nenhum envio tem o id YCloud', async () => {
        const { repository, findFirst } = criarRepository(0, false);

        await expect(
            repository.atualizarStatusPorYCloudMessageId(
                'id-ausente',
                'ENTREGUE',
                null,
            ),
        ).resolves.toBe(false);
        expect(findFirst).toHaveBeenCalledTimes(1);
    });
});
