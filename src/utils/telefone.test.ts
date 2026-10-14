import { describe, expect, it } from 'vitest';
import {
    normalizarTelefone,
    validarTelefoneCelularBrasileiro,
} from './telefone';

describe('telefone', () => {
    it('normaliza telefone nacional com prefixo 55', () => {
        expect(normalizarTelefone('(19) 99876-5432')).toBe(
            '5519998765432',
        );
    });

    it('valida celular brasileiro com DDD e nono dígito', () => {
        expect(validarTelefoneCelularBrasileiro('5519998765432')).toBe(true);
        expect(validarTelefoneCelularBrasileiro('19998765432')).toBe(true);
    });

    it('recusa telefone sem nono dígito ou DDD inválido', () => {
        expect(validarTelefoneCelularBrasileiro('551998765432')).toBe(false);
        expect(validarTelefoneCelularBrasileiro('009998765432')).toBe(false);
    });
});
