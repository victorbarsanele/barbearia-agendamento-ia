import { expect, test } from '@playwright/test';
import {
    calcularPisoAntecedencia,
    FALLBACK_MIN_ANTECEDENCIA_MINUTOS,
    normalizarMinAntecedencia,
} from '../src/utils/antecedenciaAgendamento.js';

test('normaliza inteiros válidos entre zero e 1440 minutos', () => {
    for (const valor of [15, 0, 60, 1440]) {
        expect(normalizarMinAntecedencia(valor)).toBe(valor);
    }
});

test('usa fallback para valores inválidos', () => {
    for (const valor of [
        -1,
        1441,
        15.5,
        Number.NaN,
        null,
        undefined,
        '15',
        {},
    ]) {
        expect(normalizarMinAntecedencia(valor)).toBe(
            FALLBACK_MIN_ANTECEDENCIA_MINUTOS,
        );
    }
});

test('calcula piso de antecedência de 15 minutos a partir do instante recebido', () => {
    const agora = Date.parse('2026-10-22T12:10:00.000Z');

    expect(calcularPisoAntecedencia(agora, 15)).toEqual(
        new Date('2026-10-22T12:25:00.000Z'),
    );
});

test('calcula piso de antecedência de 60 minutos a partir do instante recebido', () => {
    const agora = Date.parse('2026-10-22T12:10:00.000Z');

    expect(calcularPisoAntecedencia(agora, 60)).toEqual(
        new Date('2026-10-22T13:10:00.000Z'),
    );
});
