import { describe, expect, it } from 'vitest';
import {
    canonicalizarTelefoneWhatsApp,
    normalizarTelefone,
    validarTelefoneCelularBrasileiro,
    variantesTelefoneWhatsApp,
} from './telefone';

describe('telefone', () => {
    it('normaliza telefone nacional com prefixo 55', () => {
        expect(normalizarTelefone('(19) 99876-5432')).toBe('5519998765432');
    });

    it('valida celular brasileiro com DDD e nono dígito', () => {
        expect(validarTelefoneCelularBrasileiro('5519998765432')).toBe(true);
        expect(validarTelefoneCelularBrasileiro('19998765432')).toBe(true);
    });

    it('recusa telefone sem nono dígito ou DDD inválido', () => {
        expect(validarTelefoneCelularBrasileiro('551998765432')).toBe(false);
        expect(validarTelefoneCelularBrasileiro('009998765432')).toBe(false);
    });

    it.each([
        ['1198765432', '5511998765432'],
        ['(11) 8765-4321', '5511987654321'],
        ['551187654321', '5511987654321'],
        ['+55 (11) 8765-4321', '5511987654321'],
        ['11987654321', '5511987654321'],
        ['(11) 98765-4321', '5511987654321'],
        ['5511987654321', '5511987654321'],
        ['+55 (11) 98765-4321', '5511987654321'],
        ['551198765432', '5511998765432'],
        ['551123456789', '551123456789'],
        ['5511998765432', '5511998765432'],
    ])('canonicaliza %s para %s', (entrada, esperado) => {
        expect(canonicalizarTelefoneWhatsApp(entrada)).toBe(esperado);
    });

    it('retorna vazio sem dígitos e variantes de cliente com e sem nono dígito', () => {
        expect(canonicalizarTelefoneWhatsApp('abc')).toBe('');
        expect(variantesTelefoneWhatsApp('5511998765432')).toEqual([
            '5511998765432',
            '551198765432',
        ]);
        expect(variantesTelefoneWhatsApp('551123456789')).toEqual([
            '551123456789',
        ]);
    });
});
