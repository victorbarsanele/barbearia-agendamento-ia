import { describe, expect, it } from 'vitest';
import {
    ehConfirmacaoInequivoca,
    ehConfirmacaoRepetida,
    normalizarRespostaCurta,
} from './confirmacao-cliente';

describe('normalizarRespostaCurta', () => {
    it.each(['👍', '👍🏽', '✅', '👌🏻'])(
        'normaliza emoji afirmativo %s',
        (texto) => {
            expect(normalizarRespostaCurta(texto)).toBe('sim');
        },
    );

    it('remove acentos, pontuação e emojis e colapsa espaços', () => {
        expect(normalizarRespostaCurta('  SIM, estão ✅ certos!  ')).toBe(
            'sim estao certos',
        );
    });
});

describe('classificação de confirmação do cliente', () => {
    it.each([
        'Sim',
        'SIM',
        'sim!',
        'Sim.',
        'siiim',
        'isso mesmo',
        'Pode confirmar',
        'sim, estão',
        '👍',
        '✅',
    ])('reconhece confirmação inequívoca: %s', (texto) => {
        expect(ehConfirmacaoInequivoca(texto)).toBe(true);
    });

    it.each([
        'sim, mas muda pra 11h',
        'não',
        'sim ou não?',
        'ok obrigado',
        'pode ser outro horário',
        'isso não',
        '',
        'nao sei',
        'sim, confirmo e gostaria de adicionar outra informação longa',
    ])('rejeita confirmação ambígua ou negativa: %s', (texto) => {
        expect(ehConfirmacaoInequivoca(texto)).toBe(false);
        expect(ehConfirmacaoRepetida(texto)).toBe(false);
    });

    it('usa lista mais estreita para confirmações repetidas', () => {
        expect(ehConfirmacaoRepetida('simm')).toBe(true);
        expect(ehConfirmacaoRepetida('pode confirmar')).toBe(true);
        expect(ehConfirmacaoRepetida('ok')).toBe(false);
        expect(ehConfirmacaoRepetida('perfeito')).toBe(false);
        expect(ehConfirmacaoRepetida('certo')).toBe(false);
    });
});
