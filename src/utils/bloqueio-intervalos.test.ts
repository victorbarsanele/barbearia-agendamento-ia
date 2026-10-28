import { describe, expect, it } from 'vitest';
import { intervalosBloqueioNoDia } from './bloqueio-intervalos';

function bloqueioPontual(
    dataHoraInicio: Date | null,
    dataHoraFim: Date | null,
    escopo: 'TODOS' | 'SO_PAINEL' = 'TODOS',
) {
    return {
        dataHoraInicio,
        dataHoraFim,
        escopo,
        recorrencia: 'PONTUAL' as const,
        diaSemana: null,
        horaInicioMinutos: null,
        horaFimMinutos: null,
    };
}

describe('intervalosBloqueioNoDia', () => {
    it('recorta bloqueio pontual dentro do dia', () => {
        expect(
            intervalosBloqueioNoDia('2026-10-29', [
                bloqueioPontual(
                    new Date('2026-10-29T10:15:00-03:00'),
                    new Date('2026-10-29T12:45:00-03:00'),
                ),
            ]),
        ).toEqual([{ inicioMin: 615, fimMin: 765 }]);
    });

    it('recorta bloqueio multi-dia no primeiro, meio e último dia', () => {
        const bloqueios = [
            bloqueioPontual(
                new Date('2026-10-29T00:00:00-03:00'),
                new Date('2026-11-05T00:00:00-03:00'),
            ),
        ];

        expect(intervalosBloqueioNoDia('2026-10-29', bloqueios)).toEqual([
            { inicioMin: 0, fimMin: 1440 },
        ]);
        expect(intervalosBloqueioNoDia('2026-11-03', bloqueios)).toEqual([
            { inicioMin: 0, fimMin: 1440 },
        ]);
        expect(intervalosBloqueioNoDia('2026-11-04', bloqueios)).toEqual([
            { inicioMin: 0, fimMin: 1440 },
        ]);
        expect(intervalosBloqueioNoDia('2026-11-05', bloqueios)).toEqual([]);
    });

    it('não inclui dia seguinte quando bloqueio termina exatamente à meia-noite', () => {
        expect(
            intervalosBloqueioNoDia('2026-11-05', [
                bloqueioPontual(
                    new Date('2026-10-29T00:00:00-03:00'),
                    new Date('2026-11-05T00:00:00-03:00'),
                ),
            ]),
        ).toEqual([]);
    });

    it('expande bloqueio semanal só no dia da semana configurado', () => {
        const bloqueio = {
            ...bloqueioPontual(null, null),
            recorrencia: 'SEMANAL' as const,
            diaSemana: 3,
            horaInicioMinutos: 0,
            horaFimMinutos: 1440,
        };

        expect(intervalosBloqueioNoDia('2026-11-04', [bloqueio])).toEqual([
            { inicioMin: 0, fimMin: 1440 },
        ]);
        expect(intervalosBloqueioNoDia('2026-11-05', [bloqueio])).toEqual([]);
    });

    it('mantém escopos TODOS e SO_PAINEL, como cálculo atual da busca', () => {
        const bloqueios = [
            bloqueioPontual(
                new Date('2026-10-29T09:00:00-03:00'),
                new Date('2026-10-29T10:00:00-03:00'),
                'TODOS',
            ),
            bloqueioPontual(
                new Date('2026-10-29T10:00:00-03:00'),
                new Date('2026-10-29T11:00:00-03:00'),
                'SO_PAINEL',
            ),
        ];

        expect(intervalosBloqueioNoDia('2026-10-29', bloqueios)).toEqual([
            { inicioMin: 540, fimMin: 600 },
            { inicioMin: 600, fimMin: 660 },
        ]);
    });

    it('usa data local de São Paulo na virada de dia', () => {
        const bloqueio = bloqueioPontual(
            new Date('2026-11-02T02:30:00Z'),
            new Date('2026-11-02T04:30:00Z'),
        );

        expect(intervalosBloqueioNoDia('2026-11-01', [bloqueio])).toEqual([
            { inicioMin: 1410, fimMin: 1440 },
        ]);
        expect(intervalosBloqueioNoDia('2026-11-02', [bloqueio])).toEqual([
            { inicioMin: 0, fimMin: 90 },
        ]);
    });
});
