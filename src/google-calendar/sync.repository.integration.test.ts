import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import * as syncRepository from './sync.repository';

const agendamentoId = `google-sync-${randomUUID()}`;

async function limparOutbox(): Promise<void> {
    await prisma.sincronizacaoGoogleAgenda.deleteMany({
        where: { agendamentoId },
    });
}

describe('Google Agenda outbox integration', () => {
    beforeEach(limparOutbox);
    afterEach(limparOutbox);

    it('re-enfileira item existente incrementando versão e limpando erro', async () => {
        await syncRepository.enfileirar([agendamentoId]);
        await prisma.sincronizacaoGoogleAgenda.update({
            where: { agendamentoId },
            data: {
                status: 'ERRO',
                tentativas: 4,
                ultimoErro: 'Google Calendar HTTP 400',
            },
        });

        await syncRepository.enfileirar([agendamentoId]);

        await expect(
            prisma.sincronizacaoGoogleAgenda.findUnique({
                where: { agendamentoId },
            }),
        ).resolves.toMatchObject({
            status: 'PENDENTE',
            tentativas: 0,
            ultimoErro: null,
            versao: 2,
        });
    });

    it('reivindica lease apenas uma vez sob concorrência', async () => {
        await syncRepository.enfileirar([agendamentoId]);
        const agora = new Date();
        const resultados = await Promise.all(
            Array.from({ length: 8 }, () =>
                syncRepository.reivindicar(agora, 10),
            ),
        );

        expect(resultados.flat()).toHaveLength(1);
    });

    it('não finaliza versão superada por novo enfileiramento', async () => {
        await syncRepository.enfileirar([agendamentoId]);
        const item = await prisma.sincronizacaoGoogleAgenda.findUniqueOrThrow({
            where: { agendamentoId },
        });
        await syncRepository.enfileirar([agendamentoId]);

        await expect(
            syncRepository.finalizar(agendamentoId, item.versao, {
                status: 'SINCRONIZADO',
                tentativas: 0,
                proximaTentativaEm: new Date(),
                ultimoErro: null,
            }),
        ).resolves.toBe(false);
    });
});
