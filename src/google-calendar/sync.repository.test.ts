import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import * as syncRepository from './sync.repository';
import {
    MAXWAIT_TRANSACAO_MS,
    TAMANHO_LOTE_ENFILEIRAMENTO,
    TIMEOUT_TRANSACAO_MS,
} from './sync.repository';

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

    it('enfileira 45 IDs em lotes sequenciais 20/20/5 com timeout explícito', async () => {
        const chamadas: { ids: string[]; opcoes: unknown }[] = [];
        let cursorUpsert = 0;
        vi.mocked(prisma.sincronizacaoGoogleAgenda.upsert).mockImplementation(
            (() => Promise.resolve({})) as never,
        );
        vi.mocked(prisma.$transaction).mockImplementation((async (
            ...argumentos: unknown[]
        ) => {
            const operacoes = argumentos[0] as Promise<unknown>[];
            const chamadasUpsert = vi.mocked(
                prisma.sincronizacaoGoogleAgenda.upsert,
            ).mock.calls;
            const idsLote = chamadasUpsert
                .slice(cursorUpsert)
                .map(
                    ([upsertArgs]) =>
                        (upsertArgs as { where: { agendamentoId: string } })
                            .where.agendamentoId,
                );
            cursorUpsert = chamadasUpsert.length;
            chamadas.push({
                ids: idsLote,
                opcoes: argumentos[1],
            });
            return Promise.all(operacoes);
        }) as never);
        const ids = Array.from(
            { length: 45 },
            (_, indice) => `ag-${indice + 1}`,
        );

        await expect(syncRepository.enfileirar(ids)).resolves.toMatchObject({
            total: 45,
            falhas: 0,
            lotesFalhos: [],
        });

        expect(chamadas.map(({ ids: lote }) => lote.length)).toEqual([
            20, 20, 5,
        ]);
        expect(chamadas.flatMap(({ ids: lote }) => lote)).toEqual(ids);
        expect(chamadas.map(({ opcoes }) => opcoes)).toEqual(
            Array.from({ length: 3 }, () => ({
                timeout: TIMEOUT_TRANSACAO_MS,
                maxWait: MAXWAIT_TRANSACAO_MS,
            })),
        );
        expect(TAMANHO_LOTE_ENFILEIRAMENTO).toBe(20);
    });

    it('continua no terceiro lote após falha no segundo', async () => {
        const tamanhos: number[] = [];
        let chamada = 0;
        vi.mocked(prisma.sincronizacaoGoogleAgenda.upsert).mockImplementation(
            (() => Promise.resolve({})) as never,
        );
        vi.mocked(prisma.$transaction).mockImplementation((async (
            ...argumentos: unknown[]
        ) => {
            chamada += 1;
            const operacoes = argumentos[0] as Promise<unknown>[];
            tamanhos.push(operacoes.length);
            if (chamada === 2) throw new Error('private database text');
            return Promise.all(operacoes);
        }) as never);

        const resultado = await syncRepository.enfileirar(
            Array.from({ length: 45 }, (_, indice) => `private-id-${indice}`),
        );

        expect(tamanhos).toEqual([20, 20, 5]);
        expect(resultado).toMatchObject({
            total: 45,
            falhas: 20,
            lotesFalhos: [
                {
                    quantidadeIds: 20,
                    indiceLote: 2,
                    totalLotes: 3,
                },
            ],
        });
        expect(resultado.lotesFalhos[0]?.erro).toBeInstanceOf(Error);
    });

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
