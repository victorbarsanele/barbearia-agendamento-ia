import { expect, test } from '@playwright/test';
import {
    createBrazilDate,
    getBrazilDateParts,
    normalizeMonthYear,
} from '../src/utils/dateTime.js';
import {
    calcularScrollTopCentralizado,
    horarioRepresentavelNoSeletor,
} from '../src/utils/timePicker.js';
import {
    horarioAgendamentoAlterado,
    montarDataHoraInicioParaSalvar,
} from '../src/utils/horarioAgendamento.js';

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

test('centraliza primeiro item das colunas de hora e minuto', () => {
    expect(
        calcularScrollTopCentralizado({
            columnTop: 100,
            columnScrollTop: 0,
            columnClientHeight: 222,
            columnScrollHeight: 928,
            itemTop: 192,
            itemHeight: 40,
        }),
    ).toBe(1);
    expect(
        calcularScrollTopCentralizado({
            columnTop: 100,
            columnScrollTop: 0,
            columnClientHeight: 222,
            columnScrollHeight: 356,
            itemTop: 192,
            itemHeight: 40,
        }),
    ).toBe(1);
});

test('centraliza último item das colunas de hora e minuto', () => {
    expect(
        calcularScrollTopCentralizado({
            columnTop: 100,
            columnScrollTop: 0,
            columnClientHeight: 222,
            columnScrollHeight: 928,
            itemTop: 896,
            itemHeight: 40,
        }),
    ).toBe(705);
    expect(
        calcularScrollTopCentralizado({
            columnTop: 100,
            columnScrollTop: 0,
            columnClientHeight: 222,
            columnScrollHeight: 356,
            itemTop: 324,
            itemHeight: 40,
        }),
    ).toBe(133);
});

test('scroll centralizado limita valor quando conteúdo é menor que coluna', () => {
    expect(
        calcularScrollTopCentralizado({
            columnTop: 100,
            columnScrollTop: 0,
            columnClientHeight: 300,
            columnScrollHeight: 250,
            itemTop: 400,
            itemHeight: 40,
        }),
    ).toBe(0);
});

test('seletor reconhece horários fora de faixa ou passo', () => {
    expect(horarioRepresentavelNoSeletor('06', '00')).toBe(true);
    expect(horarioRepresentavelNoSeletor('22', '45')).toBe(true);
    expect(horarioRepresentavelNoSeletor('05', '30')).toBe(false);
    expect(horarioRepresentavelNoSeletor('09', '20')).toBe(false);
});

test('detecta horário alterado por partes e preserva timestamp original', () => {
    const original = { data: '2026-11-15', hora: '09', minuto: '00' };
    const dataHoraInicioOriginal = '2026-11-15T09:00:37.123-03:00';

    expect(horarioAgendamentoAlterado(original, { ...original })).toBe(false);
    expect(
        montarDataHoraInicioParaSalvar(dataHoraInicioOriginal, original, {
            ...original,
        }),
    ).toBe(dataHoraInicioOriginal);
    expect(
        montarDataHoraInicioParaSalvar(dataHoraInicioOriginal, original, {
            ...original,
            hora: '10',
        }),
    ).toBe('2026-11-15T10:00:00-03:00');
});
