import { StatusReativacaoEnvio } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calcularFimCooldown, estaEmCooldown } from './reativacao-cooldown';

describe('cooldown de reativação', () => {
    const criadoEm = new Date('2026-10-01T12:00:00.000Z');
    const tentativa = {
        status: StatusReativacaoEnvio.ACEITA,
        criadoEm,
    };

    it('termina exatamente após 30 dias e libera no instante-limite', () => {
        const fimCooldown = new Date('2026-10-31T12:00:00.000Z');

        expect(calcularFimCooldown(tentativa)).toEqual(fimCooldown);
        expect(estaEmCooldown(tentativa, fimCooldown)).toBe(false);
    });

    it('mantém bloqueio antes do limite', () => {
        expect(
            estaEmCooldown(tentativa, new Date('2026-10-31T11:59:59.999Z')),
        ).toBe(true);
    });

    it('libera depois do limite', () => {
        expect(
            estaEmCooldown(tentativa, new Date('2026-10-31T12:00:00.001Z')),
        ).toBe(false);
    });

    it('não bloqueia por tentativa falha', () => {
        expect(
            estaEmCooldown(
                { ...tentativa, status: StatusReativacaoEnvio.FALHOU },
                new Date('2026-10-02T12:00:00.000Z'),
            ),
        ).toBe(false);
        expect(
            calcularFimCooldown({
                ...tentativa,
                status: StatusReativacaoEnvio.FALHOU,
            }),
        ).toBeNull();
    });
});
