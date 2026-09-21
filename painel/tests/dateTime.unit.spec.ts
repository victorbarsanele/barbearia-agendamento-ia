import { expect, test } from '@playwright/test';
import {
    createBrazilDate,
    getBrazilDateParts,
    normalizeMonthYear,
} from '../src/utils/dateTime.js';

test('normalização de mês avança de dezembro para janeiro do ano seguinte', () => {
    expect(normalizeMonthYear(2026, 12)).toEqual({
        year: 2027,
        monthIndex: 0,
    });
});

test('normalização de mês volta de janeiro para dezembro do ano anterior', () => {
    expect(normalizeMonthYear(2027, -1)).toEqual({
        year: 2026,
        monthIndex: 11,
    });
});

test('normalização de mês mantém mês comum', () => {
    expect(normalizeMonthYear(2026, 5)).toEqual({
        year: 2026,
        monthIndex: 5,
    });
});

test('normalização de mês trata virada dupla', () => {
    expect(normalizeMonthYear(2026, 13)).toEqual({
        year: 2027,
        monthIndex: 1,
    });
});

test('createBrazilDate aceita índices fora da faixa', () => {
    expect(getBrazilDateParts(createBrazilDate(2026, 12, 1))).toMatchObject({
        year: 2027,
        monthIndex: 0,
    });
    expect(getBrazilDateParts(createBrazilDate(2026, -1, 1))).toMatchObject({
        year: 2025,
        monthIndex: 11,
    });
});
