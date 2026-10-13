import { EstadoEscalonamento } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { InMemoryEscalationStateRepository } from './escalation-state.repository';

const PHONE = '5511999999999';
const NOW = new Date('2026-10-12T21:00:00.000Z');

async function escalate(
    repository: InMemoryEscalationStateRepository,
    motivo = 'palavra_chave',
    durationMs = 15 * 60 * 1000,
) {
    return repository.escalar(
        PHONE,
        motivo,
        NOW,
        new Date(NOW.getTime() + durationMs),
    );
}

describe('InMemoryEscalationStateRepository', () => {
    it('reivindica aviso uma única vez em N mensagens no cooldown', async () => {
        const repository = new InMemoryEscalationStateRepository();
        await escalate(repository);

        const claims = await Promise.all(
            Array.from({ length: 5 }, () =>
                repository.reivindicarAviso(PHONE, NOW),
            ),
        );

        expect(claims.filter((claim) => claim.reivindicado)).toHaveLength(1);
    });

    it('expira para BOT e permite nova escalada com novo aviso', async () => {
        const repository = new InMemoryEscalationStateRepository();
        await escalate(repository);
        await repository.reivindicarAviso(PHONE, NOW);

        const expired = await repository.obter(
            PHONE,
            new Date(NOW.getTime() + 15 * 60 * 1000 + 1),
        );
        expect(expired?.estado).toBe(EstadoEscalonamento.BOT);

        const next = await repository.escalar(
            PHONE,
            'sem_progresso',
            new Date(NOW.getTime() + 15 * 60 * 1000 + 1),
            new Date(NOW.getTime() + 30 * 60 * 1000),
        );
        expect(next.novaEscalada).toBe(true);
        expect(
            (
                await repository.reivindicarAviso(
                    PHONE,
                    new Date(NOW.getTime() + 15 * 60 * 1000 + 1),
                )
            ).reivindicado,
        ).toBe(true);
    });

    it('usa TTL de duas horas para agendamento recorrente', async () => {
        const repository = new InMemoryEscalationStateRepository();
        await escalate(repository, 'agendamento_recorrente', 2 * 60 * 60 * 1000);

        expect((await repository.obter(PHONE, new Date(NOW.getTime() + 2 * 60 * 60 * 1000 - 1)))?.estado)
            .toBe(EstadoEscalonamento.ESCALADO);
        expect((await repository.obter(PHONE, new Date(NOW.getTime() + 2 * 60 * 60 * 1000 + 1)))?.estado)
            .toBe(EstadoEscalonamento.BOT);
    });

    it('reverte claim quando envio falha', async () => {
        const repository = new InMemoryEscalationStateRepository();
        await escalate(repository);
        const claim = await repository.reivindicarAviso(PHONE, NOW);
        await repository.liberarAviso(PHONE, claim.reivindicadoEm);

        expect((await repository.reivindicarAviso(PHONE, NOW)).reivindicado).toBe(
            true,
        );
    });
});
