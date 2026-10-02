import { expect, test } from '@playwright/test';
import {
    montarPayloadUsosAnteriores,
    rotuloPrimeiroNumero,
    validarUsosAnteriores,
} from '../src/utils/usosAnteriores.js';

test.describe('usos anteriores', () => {
    test('aceita vazio, zero e valor válido', () => {
        expect(validarUsosAnteriores('', 4)).toBeNull();
        expect(validarUsosAnteriores(0, 4)).toBeNull();
        expect(validarUsosAnteriores('2', 4)).toBeNull();
    });

    test('rejeita negativo, decimal e valores fora do limite', () => {
        expect(validarUsosAnteriores(-1, 4)).toBe(
            'Usos anteriores não podem ser negativos.',
        );
        expect(validarUsosAnteriores('1.5', 4)).toBe(
            'Informe um número inteiro.',
        );
        expect(validarUsosAnteriores(4, 4)).toBe(
            'Usos anteriores devem ser menores que a quantidade total.',
        );
        expect(validarUsosAnteriores(5, 4)).toBe(
            'Usos anteriores devem ser menores que a quantidade total.',
        );
        expect(validarUsosAnteriores('texto', 4)).toBe(
            'Informe um número inteiro.',
        );
    });

    test('monta payload somente com usos anteriores positivos', () => {
        expect(
            montarPayloadUsosAnteriores([
                { servicoId: 'servico-1', valor: '0' },
                { servicoId: 'servico-2', valor: '2' },
                { servicoId: 'servico-3', valor: '' },
            ]),
        ).toEqual([{ servicoId: 'servico-2', usosAnteriores: 2 }]);
        expect(montarPayloadUsosAnteriores([])).toEqual([]);
    });

    test('monta rótulo do primeiro número', () => {
        expect(rotuloPrimeiroNumero(1, 4)).toBe(
            'O primeiro agendamento será 2 de 4',
        );
    });
});
