import { describe, expect, it } from 'vitest';
import { maximoSimultaneoNoIntervalo } from './limite-encaixe';

function horario(hora: number, minuto = 0): Date {
    return new Date(Date.UTC(2026, 10, 2, hora, minuto));
}

describe('maximoSimultaneoNoIntervalo', () => {
    it('trata intervalos adjacentes como não simultâneos', () => {
        expect(
            maximoSimultaneoNoIntervalo(horario(10), horario(11), [
                { inicio: horario(9), fim: horario(10) },
                { inicio: horario(10), fim: horario(11) },
            ]),
        ).toBe(1);
    });

    it('conta o pico de três intervalos encadeados', () => {
        expect(
            maximoSimultaneoNoIntervalo(horario(9), horario(12), [
                { inicio: horario(9), fim: horario(10, 30) },
                { inicio: horario(10), fim: horario(11, 30) },
                { inicio: horario(11), fim: horario(12) },
            ]),
        ).toBe(2);
    });

    it('detecta três intervalos simultâneos em apenas parte do período', () => {
        expect(
            maximoSimultaneoNoIntervalo(horario(9), horario(12), [
                { inicio: horario(9), fim: horario(11) },
                { inicio: horario(10), fim: horario(12) },
                { inicio: horario(10, 30), fim: horario(11, 30) },
            ]),
        ).toBe(3);
    });
});
