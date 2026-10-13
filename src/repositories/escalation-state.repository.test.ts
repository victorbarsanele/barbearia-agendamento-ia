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
    it('reivindica aviso de mídia em BOT e respeita cooldown', async () => {
        const repository = new InMemoryEscalationStateRepository();
        const first = await repository.reivindicarAvisoMidia(
            PHONE,
            NOW,
            10 * 60 * 1000,
        );
        const second = await repository.reivindicarAvisoMidia(
            PHONE,
            new Date(NOW.getTime() + 1),
            10 * 60 * 1000,
        );

        expect(first.reivindicado).toBe(true);
        expect(second.reivindicado).toBe(false);
    });

    it('libera aviso de mídia para novo envio após falha', async () => {
        const repository = new InMemoryEscalationStateRepository();
        const claim = await repository.reivindicarAvisoMidia(
            PHONE,
            NOW,
            10 * 60 * 1000,
        );

        await repository.liberarAvisoMidia(PHONE, claim.reivindicadoEm);

        expect(
            (
                await repository.reivindicarAvisoMidia(
                    PHONE,
                    NOW,
                    10 * 60 * 1000,
                )
            ).reivindicado,
        ).toBe(true);
    });

    it('preserva cooldown de mídia através de escalada e expiração', async () => {
        const repository = new InMemoryEscalationStateRepository();
        const firstClaim = await repository.reivindicarAvisoMidia(
            PHONE,
            NOW,
            10 * 60 * 1000,
        );

        await repository.escalar(
            PHONE,
            'palavra_chave',
            NOW,
            new Date(NOW.getTime() + 1000),
        );
        expect(
            (await repository.obter(PHONE, NOW))?.avisoMidiaEnviadoEm,
        ).toEqual(firstClaim.reivindicadoEm);

        await repository.obter(
            PHONE,
            new Date(NOW.getTime() + 1001),
        );
        const afterExpiration = await repository.reivindicarAvisoMidia(
            PHONE,
            new Date(NOW.getTime() + 1001),
            10 * 60 * 1000,
        );

        expect(afterExpiration.reivindicado).toBe(false);
    });

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

    it('cria takeover em BOT e renova TTL sem perder dados de escalada', async () => {
        const repository = new InMemoryEscalationStateRepository();
        await repository.registrarRespostaHumana(
            PHONE,
            NOW,
            NOW,
            2 * 60 * 60 * 1000,
        );
        const active = await repository.obter(PHONE, NOW);

        expect(active?.estado).toBe(EstadoEscalonamento.HUMANO_ATIVO);
        expect(active?.humanoUltimaMensagemEm).toEqual(NOW);

        await repository.escalar(
            PHONE,
            'palavra_chave',
            NOW,
            new Date(NOW.getTime() + 1),
        );
        await repository.reivindicarAviso(PHONE, NOW);
        const escalated = await repository.obter(PHONE, NOW);
        await repository.registrarRespostaHumana(
            PHONE,
            new Date(NOW.getTime() + 1000),
            new Date(NOW.getTime() + 1000),
            2 * 60 * 60 * 1000,
        );
        const renewed = await repository.obter(
            PHONE,
            new Date(NOW.getTime() + 1000),
        );

        expect(escalated?.estado).toBe(EstadoEscalonamento.ESCALADO);
        expect(renewed?.avisoEsperaEnviadoEm).toEqual(
            escalated?.avisoEsperaEnviadoEm,
        );
        expect(renewed?.expiraEm?.getTime()).toBe(
            NOW.getTime() + 1000 + 2 * 60 * 60 * 1000,
        );
    });

    it('expira takeover para BOT limpando campos humanos', async () => {
        const repository = new InMemoryEscalationStateRepository();
        await repository.registrarRespostaHumana(PHONE, NOW, NOW, 1000);

        const expired = await repository.obter(
            PHONE,
            new Date(NOW.getTime() + 1001),
        );

        expect(expired).toMatchObject({
            estado: EstadoEscalonamento.BOT,
            humanoUltimaMensagemEm: null,
            expiraEm: null,
        });
    });

    it('reverte marca quando upsert falha e permite retry', async () => {
        const repository = new InMemoryEscalationStateRepository();
        repository.falharProximoTakeover = true;

        await expect(
            repository.registrarRespostaHumanaIdempotente(
                'ycloud',
                'wamid-retry',
                PHONE,
                NOW,
                NOW,
                2 * 60 * 60 * 1000,
            ),
        ).rejects.toThrow('falha simulada');

        const retry = await repository.registrarRespostaHumanaIdempotente(
            'ycloud',
            'wamid-retry',
            PHONE,
            NOW,
            NOW,
            2 * 60 * 60 * 1000,
        );
        expect(retry.duplicado).toBe(false);
    });

    it('não renova TTL em eco duplicado', async () => {
        const repository = new InMemoryEscalationStateRepository();
        const first = await repository.registrarRespostaHumanaIdempotente(
            'ycloud',
            'wamid-once',
            PHONE,
            NOW,
            NOW,
            2 * 60 * 60 * 1000,
        );
        const duplicate = await repository.registrarRespostaHumanaIdempotente(
            'ycloud',
            'wamid-once',
            PHONE,
            new Date(NOW.getTime() + 1000),
            new Date(NOW.getTime() + 1000),
            2 * 60 * 60 * 1000,
        );

        expect(first.duplicado).toBe(false);
        expect(duplicate.duplicado).toBe(true);
        expect(
            (await repository.obter(PHONE, NOW))?.expiraEm,
        ).toEqual(first.estado?.expiraEm);
    });
});
