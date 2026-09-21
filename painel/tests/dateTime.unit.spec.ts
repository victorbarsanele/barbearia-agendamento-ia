import { describe, expect, it } from 'vitest';
import {
    createBrazilDate,
    getBrazilDateParts,
    normalizeMonthYear,
} from '../src/utils/dateTime.js';

describe('normalização de mês do calendário', () => {
    it('avança de dezembro para janeiro do ano seguinte', () => {
        expect(normalizeMonthYear(2026, 12)).toEqual({
            year: 2027,
            monthIndex: 0,
        });
    });

    it('volta de janeiro para dezembro do ano anterior', () => {
        expect(normalizeMonthYear(2027, -1)).toEqual({
            year: 2026,
            monthIndex: 11,
        });
    });

    it('mantém mês comum', () => {
        expect(normalizeMonthYear(2026, 5)).toEqual({
            year: 2026,
            monthIndex: 5,
        });
    });

    it('normaliza virada dupla', () => {
        expect(normalizeMonthYear(2026, 13)).toEqual({
            year: 2027,
            monthIndex: 1,
        });
    });

    it('cria datas válidas para índices fora da faixa', () => {
        expect(getBrazilDateParts(createBrazilDate(2026, 12, 1))).toMatchObject(
            {
                year: 2027,
                monthIndex: 0,
            },
        );
        expect(getBrazilDateParts(createBrazilDate(2026, -1, 1))).toMatchObject(
            {
                year: 2025,
                monthIndex: 11,
            },
        );
    });
});
