import { describe, expect, it } from 'vitest';
import { calcularIntervaloRelatorio } from './intervalo-relatorio';

describe('calcularIntervaloRelatorio', () => {
    it('converte dia local único em intervalo semiaberto UTC', () => {
        expect(calcularIntervaloRelatorio('2026-10-10', '2026-10-10')).toEqual({
            inicio: new Date('2026-10-10T03:00:00.000Z'),
            fimExclusivo: new Date('2026-10-11T03:00:00.000Z'),
        });
    });

    it('calcula dia final exclusivo por calendário', () => {
        expect(calcularIntervaloRelatorio('2026-12-31', '2026-12-31')).toEqual({
            inicio: new Date('2026-12-31T03:00:00.000Z'),
            fimExclusivo: new Date('2027-01-01T03:00:00.000Z'),
        });
    });
});
