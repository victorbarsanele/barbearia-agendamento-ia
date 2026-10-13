import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EstadoEscalonamento, PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';
import { PrismaEscalationStateRepository } from './escalation-state.repository';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PHONE = `551199${RUN_ID.replace(/\D/g, '').slice(-7)}`;
const MESSAGE_IDS = [
    `concurrent-echo-${RUN_ID}`,
    `failed-transaction-${RUN_ID}`,
];

describe('PrismaEscalationStateRepository claim integration', () => {
    async function cleanup(): Promise<void> {
        await prisma.escalonamentoWhatsApp.deleteMany({
            where: { telefone: PHONE },
        });
        await prisma.mensagemWhatsAppProcessada.deleteMany({
            where: {
                provedor: 'ycloud',
                idMensagem: { in: MESSAGE_IDS },
            },
        });
    }

    beforeEach(cleanup);
    afterEach(cleanup);

    it('allows only one concurrent wait-message claim', async () => {
        const repository = new PrismaEscalationStateRepository(prisma);
        const now = new Date();
        await repository.escalar(
            PHONE,
            'palavra_chave',
            now,
            new Date(now.getTime() + 15 * 60 * 1000),
        );

        const claims = await Promise.all(
            Array.from({ length: 10 }, () =>
                repository.reivindicarAviso(PHONE, new Date()),
            ),
        );

        expect(claims.filter((claim) => claim.reivindicado)).toHaveLength(1);
        expect(
            (await prisma.escalonamentoWhatsApp.findUnique({
                where: { telefone: PHONE },
            }))?.estado,
        ).toBe(EstadoEscalonamento.ESCALADO);
    });

    it('allows one concurrent media notice claim in BOT during cooldown', async () => {
        const repository = new PrismaEscalationStateRepository(prisma);
        const now = new Date();
        const claims = await Promise.all(
            Array.from({ length: 10 }, () =>
                repository.reivindicarAvisoMidia(
                    PHONE,
                    now,
                    10 * 60 * 1000,
                ),
            ),
        );

        expect(claims.filter((claim) => claim.reivindicado)).toHaveLength(1);
        expect(
            (await prisma.escalonamentoWhatsApp.findUnique({
                where: { telefone: PHONE },
            }))?.estado,
        ).toBe(EstadoEscalonamento.BOT);
    });

    it('preserves media cooldown across escalation and expiration', async () => {
        const repository = new PrismaEscalationStateRepository(prisma);
        const now = new Date();
        const firstClaim = await repository.reivindicarAvisoMidia(
            PHONE,
            now,
            10 * 60 * 1000,
        );

        await repository.escalar(
            PHONE,
            'palavra_chave',
            now,
            new Date(now.getTime() + 1000),
        );
        await repository.obter(PHONE, new Date(now.getTime() + 1001));

        const afterExpiration = await repository.reivindicarAvisoMidia(
            PHONE,
            new Date(now.getTime() + 1001),
            10 * 60 * 1000,
        );

        expect(firstClaim.reivindicado).toBe(true);
        expect(afterExpiration.reivindicado).toBe(false);
    });

    it('handles two concurrent human takeover upserts atomically', async () => {
        const repository = new PrismaEscalationStateRepository(prisma);
        const now = new Date();
        const messageId = MESSAGE_IDS[0]!;

        await Promise.all([
            repository.registrarRespostaHumanaIdempotente(
                'ycloud',
                messageId,
                PHONE,
                now,
                now,
                2 * 60 * 60 * 1000,
            ),
            repository.registrarRespostaHumanaIdempotente(
                'ycloud',
                messageId,
                PHONE,
                new Date(now.getTime() + 1000),
                new Date(now.getTime() + 1000),
                2 * 60 * 60 * 1000,
            ),
        ]);

        const marker = await prisma.mensagemWhatsAppProcessada.findMany({
            where: {
                provedor: 'ycloud',
                idMensagem: messageId,
            },
        });
        const rows = await prisma.escalonamentoWhatsApp.findMany({
            where: { telefone: PHONE },
        });
        expect(marker).toHaveLength(1);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.estado).toBe(EstadoEscalonamento.HUMANO_ATIVO);
    });

    it('rolls back marker when transaction fails during takeover upsert', async () => {
        const now = new Date();
        const messageId = MESSAGE_IDS[1]!;
        const failingClient = criarClientComFalhaNoUpsert(prisma);
        const repository = new PrismaEscalationStateRepository(failingClient);

        await expect(
            repository.registrarRespostaHumanaIdempotente(
                'ycloud',
                messageId,
                PHONE,
                now,
                now,
                Number.NaN,
            ),
        ).rejects.toThrow();

        const marker = await prisma.mensagemWhatsAppProcessada.findMany({
            where: {
                provedor: 'ycloud',
                idMensagem: messageId,
            },
        });
        expect(marker).toHaveLength(0);
        expect(
            await prisma.escalonamentoWhatsApp.findUnique({
                where: { telefone: PHONE },
            }),
        ).toBeNull();

        const retry = new PrismaEscalationStateRepository(prisma);
        await expect(
            retry.registrarRespostaHumanaIdempotente(
                'ycloud',
                messageId,
                PHONE,
                now,
                now,
                2 * 60 * 60 * 1000,
            ),
        ).resolves.toMatchObject({ duplicado: false });
    });
});

function criarClientComFalhaNoUpsert(client: PrismaClient): PrismaClient {
    return new Proxy(client, {
        get(target, property, receiver) {
            if (property !== '$transaction') {
                return Reflect.get(target, property, receiver);
            }

            return (
                callback: (transactionClient: unknown) => Promise<unknown>,
            ) =>
                target.$transaction(async (transactionClient) => {
                    const failingTransaction = new Proxy(transactionClient, {
                        get(transactionTarget, transactionProperty, transactionReceiver) {
                            if (
                                transactionProperty !==
                                'escalonamentoWhatsApp'
                            ) {
                                return Reflect.get(
                                    transactionTarget,
                                    transactionProperty,
                                    transactionReceiver,
                                );
                            }

                            const model = Reflect.get(
                                transactionTarget,
                                transactionProperty,
                                transactionReceiver,
                            ) as object;
                            return new Proxy(model, {
                                get(modelTarget, modelProperty, modelReceiver) {
                                    if (modelProperty !== 'upsert') {
                                        return Reflect.get(
                                            modelTarget,
                                            modelProperty,
                                            modelReceiver,
                                        );
                                    }
                                    return () => {
                                        throw new Error(
                                            'FALHA_FORCADA_TESTE',
                                        );
                                    };
                                },
                            });
                        },
                    });
                    return callback(failingTransaction);
                });
        },
    });
}
