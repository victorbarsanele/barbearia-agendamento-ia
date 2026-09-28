import { expect, test } from '@playwright/test';
import { formatarNumeroNoPacote } from '../src/utils/numeroNoPacote.js';

test('formata ordinal do uso de pacote', () => {
    expect(formatarNumeroNoPacote(2, 4)).toBe('2º de 4');
});

test('não formata quando número ou total não existe', () => {
    expect(formatarNumeroNoPacote(null, 4)).toBeNull();
    expect(formatarNumeroNoPacote(2, null)).toBeNull();
});