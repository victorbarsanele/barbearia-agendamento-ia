import { describe, expect, it } from 'vitest';
import {
    dataMaisProximaComDiaDaSemana,
    diaDaSemanaEmBrasilia,
    nomeDiaDaSemana,
} from './dia-semana';

describe('dataMaisProximaComDiaDaSemana', () => {
    it.each([
        ['2026-10-30', 'sabado', '2026-10-31'],
        ['2026-10-23', 'sabado', '2026-10-24'],
        ['2026-10-16', 'sabado', '2026-10-17'],
        ['2026-10-17', 'sexta', '2026-10-16'],
        ['2026-10-30', 'segunda', '2026-11-02'],
    ] as const)('%s + %s = %s', (date, weekday, expected) => {
        expect(dataMaisProximaComDiaDaSemana(date, weekday)).toBe(expected);
    });

    describe('diaDaSemanaEmBrasilia', () => {
        it('usa data local de Brasília para instantes próximos da meia-noite UTC', () => {
            expect(diaDaSemanaEmBrasilia(new Date('2026-10-15T02:59:00Z'))).toBe(
                'quarta',
            );
            expect(diaDaSemanaEmBrasilia(new Date('2026-10-15T03:00:00Z'))).toBe(
                'quinta',
            );
            expect(diaDaSemanaEmBrasilia('2026-10-17')).toBe('sabado');
            expect(nomeDiaDaSemana('sabado')).toBe('sábado');
        });
    });
});
