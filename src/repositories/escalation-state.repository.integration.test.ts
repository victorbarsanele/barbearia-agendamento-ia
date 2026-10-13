import { afterEach, describe, expect, it } from 'vitest';
import { EstadoEscalonamento } from '@prisma/client';
import prisma from '../lib/prisma';
import { PrismaEscalationStateRepository } from './escalation-state.repository';

const PHONE = `551199${Date.now().toString().slice(-7)}`;

describe('PrismaEscalationStateRepository claim integration', () => {
    afterEach(async () => {
        await prisma.escalonamentoWhatsApp.deleteMany({
            where: { telefone: PHONE },
        });
    });

    it('allows only one concurrent wait-message claim', async () => {
        const repository = new PrismaEscalationStateRepository();
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
});
