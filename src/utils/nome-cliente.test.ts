import { describe, expect, it } from 'vitest';
import {
    nomeClienteInformadoPeloCliente,
    validarNomeCliente,
} from './nome-cliente';

describe('validarNomeCliente', () => {
    it.each([
        'João Silva',
        'Maria da Conceição',
        "D'Ávila Souza",
        'Ana-Clara Lima',
        'Leonardo Souza',
    ])('aceita nome completo %s', (nome) => {
        expect(validarNomeCliente(nome)).toEqual({ ok: true, nome });
    });

    it.each([
        'Cliente',
        'cliente',
        '-',
        '.',
        'Nome',
        'Nome Cliente',
        'N/A',
        'Leo',
        'Leonardo',
        'João123 Silva',
        '😀 Souza',
        '',
        '   ',
        'A'.repeat(119) + ' B',
        123,
        null,
        undefined,
    ])('rejeita entrada inválida %s sem lançar exceção', (nome) => {
        expect(() => validarNomeCliente(nome)).not.toThrow();
        expect(validarNomeCliente(nome).ok).toBe(false);
    });
});

describe('nomeClienteInformadoPeloCliente', () => {
    it('aceita palavras ditas com diferenças de acento e caixa', () => {
        expect(
            nomeClienteInformadoPeloCliente('João Silva', [
                'me chamo JOAO',
                'silva',
            ]),
        ).toBe(true);
    });

    it('rejeita palavra nunca dita pelo cliente', () => {
        expect(nomeClienteInformadoPeloCliente('Léo Almeida', ['oi léo'])).toBe(
            false,
        );
    });

    it.each([[], null, undefined])(
        'rejeita contexto vazio ou ausente: %s',
        (mensagens) => {
            expect(
                nomeClienteInformadoPeloCliente(
                    'João Silva',
                    mensagens as readonly string[] | null | undefined,
                ),
            ).toBe(false);
        },
    );
});
