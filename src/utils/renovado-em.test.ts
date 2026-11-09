import { describe, expect, it } from 'vitest';
import { obterRenovadoEm } from './renovado-em';

describe('obterRenovadoEm', () => {
    it.each([
        ['2026-03-02T02:30:00.000Z', '2026-03-01'],
        ['2026-03-02T03:30:00.000Z', '2026-03-02'],
        ['2026-03-02T00:30:00.000Z', '2026-03-01'],
    ])('converte instante %s para dia local %s', (instante, esperado) => {
        expect(obterRenovadoEm('ciclo-anterior', new Date(instante))).toBe(
            esperado,
        );
    });

    it('preserva data calendário recebida do relatório SQL', () => {
        expect(obterRenovadoEm('ciclo-anterior', '2026-03-02')).toBe(
            '2026-03-02',
        );
    });

    it('retorna null quando ciclo não veio de renovação', () => {
        expect(obterRenovadoEm(null, '2026-03-02')).toBeNull();
    });
});
