import { expect, test } from '@playwright/test';
import { formatarTelefone } from '../src/utils/formatarTelefone.js';

test('formata telefone brasileiro com celular e DDI', () => {
    expect(formatarTelefone('5511923705328')).toBe('+55 11 92370-5328');
});

test('formata telefone brasileiro fixo com DDI', () => {
    expect(formatarTelefone('551123705328')).toBe('+55 11 2370-5328');
});

test('formata entrada com máscara e símbolos', () => {
    expect(formatarTelefone('+55 (11) 92370-5328')).toBe('+55 11 92370-5328');
});

test('mantém número curto inalterado', () => {
    expect(formatarTelefone('9999999')).toBe('9999999');
});

test('mantém string vazia inalterada', () => {
    expect(formatarTelefone('')).toBe('');
});

test('mantém número de 13 dígitos sem DDI 55 inalterado', () => {
    expect(formatarTelefone('9911923705328')).toBe('9911923705328');
});
