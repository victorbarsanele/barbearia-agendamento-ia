import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import * as syncRepository from './sync.repository';

vi.mock('../lib/prisma', () => ({
    default: {
        $transaction: vi.fn(),
        sincronizacaoGoogleAgenda: {
            upsert: vi.fn(),
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

describe('Google Agenda outbox repository', () => {
    beforeEach(() => vi.clearAllMocks());

    it('não processa candidato quando lease atômico perde concorrência', async () => {
        vi.mocked(prisma.sincronizacaoGoogleAgenda.findMany).mockResolvedValue([
            { agendamentoId: 'agendamento-1', tentativas: 0, versao: 4 },
        ] as never);
        vi.mocked(
            prisma.sincronizacaoGoogleAgenda.updateMany,
        ).mockResolvedValue({
            count: 0,
        });

        await expect(
            syncRepository.reivindicar(new Date(), 10),
        ).resolves.toEqual([]);
    });

    it('não finaliza item quando versão mudou após reivindicação', async () => {
        vi.mocked(
            prisma.sincronizacaoGoogleAgenda.updateMany,
        ).mockResolvedValue({
            count: 0,
        });

        await expect(
            syncRepository.finalizar('agendamento-1', 4, {
                status: 'SINCRONIZADO',
                tentativas: 0,
                proximaTentativaEm: new Date(),
                ultimoErro: null,
            }),
        ).resolves.toBe(false);
        expect(
            prisma.sincronizacaoGoogleAgenda.updateMany,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { agendamentoId: 'agendamento-1', versao: 4 },
            }),
        );
    });
});
