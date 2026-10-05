import { expect, test } from '@playwright/test';
import { nomeConfereComConfirmacao } from '../src/utils/nomeConfereComConfirmacao.js';

test('aceita nome igual', () => {
    expect(nomeConfereComConfirmacao('Maria Silva', 'Maria Silva')).toBe(true);
});

test('ignora acentos e caixa', () => {
    expect(nomeConfereComConfirmacao('JOSE DA SILVA', 'José da Silva')).toBe(
        true,
    );
});

test('ignora espaços nas pontas', () => {
    expect(nomeConfereComConfirmacao('  Maria Silva  ', 'Maria Silva')).toBe(
        true,
    );
});

test('rejeita vazio', () => {
    expect(nomeConfereComConfirmacao('', 'Maria Silva')).toBe(false);
});

test('rejeita nome diferente', () => {
    expect(nomeConfereComConfirmacao('Maria Souza', 'Maria Silva')).toBe(false);
});
