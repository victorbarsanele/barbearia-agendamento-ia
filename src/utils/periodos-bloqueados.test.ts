import { describe, expect, it } from 'vitest';
import type { HorarioFuncionamentoConfig } from '../services/horario-funcionamento';
import {
    calcularPeriodoBloqueado,
    diaTotalmenteBloqueado,
    listarPeriodosBloqueados,
} from './periodos-bloqueados';

type Bloqueios = Parameters<typeof diaTotalmenteBloqueado>[2];

function criarFuncionamento(
    fechado: number[] = [0],
    almoco: [number, number] | null = null,
): HorarioFuncionamentoConfig[] {
    return Array.from({ length: 7 }, (_, diaSemana) => diaSemana)
        .filter((diaSemana) => !fechado.includes(diaSemana))
        .map((diaSemana) => ({
            diaSemana,
            horaAberturaMinutos: 540,
            horaFechamentoMinutos: 1020,
            almocoInicioMinutos: almoco?.[0] ?? null,
            almocoFimMinutos: almoco?.[1] ?? null,
            limiteExtensaoMinutos: null,
            ultimoInicioExtensaoMinutos: null,
        }));
}

function bloqueioPontual(
    inicio: string,
    fim: string,
    escopo: 'TODOS' | 'SO_PAINEL' = 'TODOS',
    motivo = 'Bloqueio',
) {
    return {
        dataHoraInicio: new Date(inicio),
        dataHoraFim: new Date(fim),
        escopo,
        recorrencia: 'PONTUAL' as const,
        diaSemana: null,
        horaInicioMinutos: null,
        horaFimMinutos: null,
        motivo,
    };
}

function bloqueioSemanal(
    diaSemana: number,
    inicioMinutos = 0,
    fimMinutos = 1440,
) {
    return {
        dataHoraInicio: null,
        dataHoraFim: null,
        escopo: 'TODOS' as const,
        recorrencia: 'SEMANAL' as const,
        diaSemana,
        horaInicioMinutos: inicioMinutos,
        horaFimMinutos: fimMinutos,
    };
}

const funcionamento = criarFuncionamento();

describe('diaTotalmenteBloqueado', () => {
    it('reconhece período real e pula domingo fechado até retorno em 05/11', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-10-29T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
                'TODOS',
                'Viagem',
            ),
        ];
        const config = criarFuncionamento([0]);

        expect(diaTotalmenteBloqueado('2026-10-28', config, bloqueios)).toBe(
            false,
        );
        expect(diaTotalmenteBloqueado('2026-10-29', config, bloqueios)).toBe(
            true,
        );
        expect(diaTotalmenteBloqueado('2026-11-01', config, bloqueios)).toBe(
            false,
        );
        expect(diaTotalmenteBloqueado('2026-11-04', config, bloqueios)).toBe(
            true,
        );
        expect(diaTotalmenteBloqueado('2026-11-05', config, bloqueios)).toBe(
            false,
        );
        expect(
            calcularPeriodoBloqueado('2026-10-29', config, bloqueios),
        ).toEqual({
            bloqueado: true,
            retornoEm: '2026-11-05',
        });
        expect(
            listarPeriodosBloqueados('2026-10-28', 9, config, bloqueios),
        ).toEqual([
            {
                inicio: '2026-10-29',
                fim: '2026-11-04',
                retornoEm: '2026-11-05',
                motivos: ['Viagem'],
            },
        ]);
    });

    it('retorna false para bloqueio parcial', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-11-04T09:00:00-03:00',
                '2026-11-04T10:00:00-03:00',
            ),
        ];

        expect(
            diaTotalmenteBloqueado('2026-11-04', funcionamento, bloqueios),
        ).toBe(false);
    });

    it('une bloqueios adjacentes e detecta lacuna de um minuto', () => {
        const adjacentes: Bloqueios = [
            bloqueioPontual(
                '2026-11-04T09:00:00-03:00',
                '2026-11-04T12:00:00-03:00',
            ),
            bloqueioPontual(
                '2026-11-04T12:00:00-03:00',
                '2026-11-04T17:00:00-03:00',
            ),
        ];
        const comLacuna: Bloqueios = [
            adjacentes[0],
            bloqueioPontual(
                '2026-11-04T12:01:00-03:00',
                '2026-11-04T17:00:00-03:00',
            ),
        ];

        expect(
            diaTotalmenteBloqueado('2026-11-04', funcionamento, adjacentes),
        ).toBe(true);
        expect(
            diaTotalmenteBloqueado('2026-11-04', funcionamento, comLacuna),
        ).toBe(false);
    });

    it('considera almoço como intervalo fechado entre dois períodos abertos', () => {
        const config = criarFuncionamento([0], [720, 780]);
        const doisPeriodos: Bloqueios = [
            bloqueioPontual(
                '2026-11-04T09:00:00-03:00',
                '2026-11-04T12:00:00-03:00',
            ),
            bloqueioPontual(
                '2026-11-04T13:00:00-03:00',
                '2026-11-04T17:00:00-03:00',
            ),
        ];
        const primeiroPeriodo: Bloqueios = [doisPeriodos[0]];

        expect(diaTotalmenteBloqueado('2026-11-04', config, doisPeriodos)).toBe(
            true,
        );
        expect(
            diaTotalmenteBloqueado('2026-11-04', config, primeiroPeriodo),
        ).toBe(false);
    });

    it('aplica bloqueio semanal só nas quartas e retorna no próximo dia aberto', () => {
        const bloqueios: Bloqueios = [bloqueioSemanal(3)];

        expect(
            diaTotalmenteBloqueado('2026-11-04', funcionamento, bloqueios),
        ).toBe(true);
        expect(
            diaTotalmenteBloqueado('2026-11-05', funcionamento, bloqueios),
        ).toBe(false);
        expect(
            calcularPeriodoBloqueado('2026-11-04', funcionamento, bloqueios),
        ).toEqual({ bloqueado: true, retornoEm: '2026-11-05' });
    });

    it('retorna null quando não há dia aberto livre dentro do limite', () => {
        const bloqueios: Bloqueios = Array.from({ length: 7 }, (_, dia) =>
            bloqueioSemanal(dia),
        );

        expect(
            calcularPeriodoBloqueado('2026-11-04', funcionamento, bloqueios, 7),
        ).toEqual({ bloqueado: true, retornoEm: null });
    });

    it('ordena motivos pelo início do bloqueio, remove duplicatas e ignora vazios', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-11-04T12:00:00-03:00',
                '2026-11-04T17:00:00-03:00',
                'TODOS',
                'Tarde',
            ),
            bloqueioPontual(
                '2026-11-04T09:00:00-03:00',
                '2026-11-04T12:00:00-03:00',
                'TODOS',
                'Manhã',
            ),
            bloqueioPontual(
                '2026-11-04T13:00:00-03:00',
                '2026-11-04T14:00:00-03:00',
                'TODOS',
                'Tarde',
            ),
            bloqueioPontual(
                '2026-11-04T14:00:00-03:00',
                '2026-11-04T15:00:00-03:00',
                'TODOS',
                '   ',
            ),
        ];

        expect(
            listarPeriodosBloqueados(
                '2026-11-04',
                1,
                funcionamento,
                bloqueios,
            )[0].motivos,
        ).toEqual(['Manhã', 'Tarde']);
    });

    it('deixa motivos vazio para bloqueio semanal sem texto', () => {
        const bloqueios: Bloqueios = [bloqueioSemanal(3)];

        expect(
            listarPeriodosBloqueados(
                '2026-11-04',
                1,
                funcionamento,
                bloqueios,
            )[0].motivos,
        ).toEqual([]);
    });

    it('mantém bloqueio SO_PAINEL na cobertura e omite seu motivo', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-11-04T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
                'SO_PAINEL',
                'Compromisso interno',
            ),
        ];

        expect(
            diaTotalmenteBloqueado('2026-11-04', funcionamento, bloqueios),
        ).toBe(true);
        expect(
            listarPeriodosBloqueados(
                '2026-11-04',
                1,
                funcionamento,
                bloqueios,
            )[0].motivos,
        ).toEqual([]);
    });

    it('inclui só motivos TODOS em período misto', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-11-04T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
                'SO_PAINEL',
                'Compromisso interno',
            ),
            bloqueioPontual(
                '2026-11-04T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
                'TODOS',
                'Feriado',
            ),
        ];

        expect(
            listarPeriodosBloqueados(
                '2026-11-04',
                1,
                funcionamento,
                bloqueios,
            )[0].motivos,
        ).toEqual(['Feriado']);
    });

    it('não bloqueia dia seguinte quando bloqueio termina à meia-noite local', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-10-29T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
            ),
        ];

        expect(
            diaTotalmenteBloqueado('2026-11-05', funcionamento, bloqueios),
        ).toBe(false);
    });
});

describe('listarPeriodosBloqueados', () => {
    it('separa grupos quando há dia aberto livre entre eles', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-10-29T00:00:00-03:00',
                '2026-11-01T00:00:00-03:00',
            ),
            bloqueioPontual(
                '2026-11-03T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
            ),
        ];

        expect(
            listarPeriodosBloqueados(
                '2026-10-29',
                9,
                criarFuncionamento([0]),
                bloqueios,
            ),
        ).toEqual([
            {
                inicio: '2026-10-29',
                fim: '2026-10-31',
                retornoEm: '2026-11-02',
                motivos: ['Bloqueio'],
            },
            {
                inicio: '2026-11-03',
                fim: '2026-11-04',
                retornoEm: '2026-11-05',
                motivos: ['Bloqueio'],
            },
        ]);
    });

    it('calcula retorno além do fim da janela para grupo ainda bloqueado', () => {
        const bloqueios: Bloqueios = [
            bloqueioPontual(
                '2026-10-29T00:00:00-03:00',
                '2026-11-05T00:00:00-03:00',
            ),
        ];

        expect(
            listarPeriodosBloqueados(
                '2026-10-29',
                3,
                criarFuncionamento([0]),
                bloqueios,
            ),
        ).toEqual([
            {
                inicio: '2026-10-29',
                fim: '2026-10-31',
                retornoEm: '2026-11-05',
                motivos: ['Bloqueio'],
            },
        ]);
    });
});
