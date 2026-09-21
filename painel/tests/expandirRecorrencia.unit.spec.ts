import { test, expect } from '@playwright/test';
import {
    expandirRecorrencia,
    validarRecorrencia,
} from '../src/components/LoteAgendamentoModal/expandirRecorrencia.js';

const base = {
    dataInicial: '2026-01-05',
    diasSelecionados: new Set([1]),
    horarioPorDia: { 1: '10:00' },
    criterioParada: 'ocorrencias' as const,
    dataFinal: '',
    numeroOcorrencias: 3,
};

test('semanal e intervalo 1 explícito são equivalentes', () => {
    expect(expandirRecorrencia(base)).toEqual(
        expandirRecorrencia({ ...base, intervaloSemanas: 1 }),
    );
});

test('gera ocorrências para um dia da semana', () => {
    expect(expandirRecorrencia(base).slots).toEqual([
        { data: '2026-01-05', horario: '10:00' },
        { data: '2026-01-12', horario: '10:00' },
        { data: '2026-01-19', horario: '10:00' },
    ]);
});

test('conta slots com segunda e quarta', () => {
    expect(
        expandirRecorrencia({
            ...base,
            diasSelecionados: new Set([1, 3]),
            horarioPorDia: { 1: '09:00', 3: '11:00' },
            numeroOcorrencias: 4,
        }).slots,
    ).toEqual([
        { data: '2026-01-05', horario: '09:00' },
        { data: '2026-01-07', horario: '11:00' },
        { data: '2026-01-12', horario: '09:00' },
        { data: '2026-01-14', horario: '11:00' },
    ]);
});

test('começa na data inicial no meio da semana', () => {
    expect(
        expandirRecorrencia({
            ...base,
            dataInicial: '2026-01-07',
            diasSelecionados: new Set([1, 3]),
            horarioPorDia: { 1: '09:00', 3: '11:00' },
        }).slots,
    ).toEqual([
        { data: '2026-01-07', horario: '11:00' },
        { data: '2026-01-12', horario: '09:00' },
        { data: '2026-01-14', horario: '11:00' },
    ]);
});

test('intervalo de 2 semanas e múltiplos dias', () => {
    expect(
        expandirRecorrencia({
            ...base,
            diasSelecionados: new Set([1, 3]),
            horarioPorDia: { 1: '09:00', 3: '11:00' },
            intervaloSemanas: 2,
            numeroOcorrencias: 4,
        }).slots,
    ).toEqual([
        { data: '2026-01-05', horario: '09:00' },
        { data: '2026-01-07', horario: '11:00' },
        { data: '2026-01-19', horario: '09:00' },
        { data: '2026-01-21', horario: '11:00' },
    ]);
});

test('intervalo de 3 semanas', () => {
    expect(expandirRecorrencia({ ...base, intervaloSemanas: 3 }).slots).toEqual(
        [
            { data: '2026-01-05', horario: '10:00' },
            { data: '2026-01-26', horario: '10:00' },
            { data: '2026-02-16', horario: '10:00' },
        ],
    );
});

test('data inicial na quarta não inclui segunda anterior', () => {
    expect(
        expandirRecorrencia({
            ...base,
            dataInicial: '2026-01-07',
            diasSelecionados: new Set([1, 3]),
            horarioPorDia: { 1: '09:00', 3: '11:00' },
            intervaloSemanas: 2,
        }).slots,
    ).toEqual([
        { data: '2026-01-07', horario: '11:00' },
        { data: '2026-01-19', horario: '09:00' },
        { data: '2026-01-21', horario: '11:00' },
    ]);
});

test('data inicial no domingo ancora semana de segunda anterior', () => {
    expect(
        expandirRecorrencia({
            ...base,
            dataInicial: '2026-01-11',
            intervaloSemanas: 2,
            numeroOcorrencias: 2,
        }).slots,
    ).toEqual([
        { data: '2026-01-19', horario: '10:00' },
        { data: '2026-02-02', horario: '10:00' },
    ]);
});

test('para por data final', () => {
    expect(
        expandirRecorrencia({
            ...base,
            criterioParada: 'data',
            dataFinal: '2026-01-19',
            numeroOcorrencias: 0,
        }).slots,
    ).toHaveLength(3);
});

test('data final antes da inicial mantém primeira data elegível', () => {
    expect(
        expandirRecorrencia({
            ...base,
            criterioParada: 'data',
            dataFinal: '2026-01-04',
            numeroOcorrencias: 0,
        }).slots,
    ).toEqual([{ data: '2026-01-05', horario: '10:00' }]);
});

test('trunca no teto absoluto', () => {
    const resultado = expandirRecorrencia({
        ...base,
        intervaloSemanas: 52,
        numeroOcorrencias: 20,
    });

    expect(resultado.truncadoPorLimite).toBe(true);
    expect(resultado.solicitadas).toBe(20);
    expect(resultado.slots.length).toBeLessThan(20);
});

test('não trunca quando intervalo 8 cabe no teto', () => {
    const resultado = expandirRecorrencia({
        ...base,
        intervaloSemanas: 8,
        numeroOcorrencias: 12,
    });

    expect(resultado.truncadoPorLimite).toBe(false);
    expect(resultado.slots).toHaveLength(12);
});

test('nenhum dia com horário não trunca', () => {
    const resultado = expandirRecorrencia({
        ...base,
        horarioPorDia: {},
    });

    expect(resultado).toEqual({
        slots: [],
        truncadoPorLimite: false,
        solicitadas: 3,
    });
});

test('teto de 730 dias vale também no modo por data', () => {
    const resultado = expandirRecorrencia({
        ...base,
        criterioParada: 'data',
        dataFinal: '2028-02-01',
        numeroOcorrencias: 0,
    });

    expect(resultado.truncadoPorLimite).toBe(true);
    expect(resultado.slots.length).toBeGreaterThan(0);
});

test('data final exatamente no limite de 730 dias é inclusiva e não trunca', () => {
    const resultado = expandirRecorrencia({
        ...base,
        criterioParada: 'data',
        dataFinal: '2028-01-05',
        numeroOcorrencias: 0,
    });

    expect(resultado.truncadoPorLimite).toBe(false);
    expect(resultado.slots.at(-1)).toEqual({
        data: '2028-01-03',
        horario: '10:00',
    });
});

test('data final em 731 dias ultrapassa limite absoluto e trunca', () => {
    const resultado = expandirRecorrencia({
        ...base,
        criterioParada: 'data',
        dataFinal: '2028-01-06',
        numeroOcorrencias: 0,
    });

    expect(resultado.truncadoPorLimite).toBe(true);
});

test('ocorrências no limite absoluto distinguem 3 e 4 slots', () => {
    const tresOcorrencias = expandirRecorrencia({
        ...base,
        intervaloSemanas: 52,
        numeroOcorrencias: 3,
    });
    const quatroOcorrencias = expandirRecorrencia({
        ...base,
        intervaloSemanas: 52,
        numeroOcorrencias: 4,
    });

    expect(tresOcorrencias.slots).toHaveLength(3);
    expect(tresOcorrencias.truncadoPorLimite).toBe(false);
    expect(quatroOcorrencias.slots).toHaveLength(3);
    expect(quatroOcorrencias.truncadoPorLimite).toBe(true);
    expect(quatroOcorrencias.solicitadas).toBe(4);
});

test.describe('validarRecorrencia', () => {
    test('rejeita intervalo 0, 53, 1.5 e NaN', () => {
        for (const intervaloSemanas of [0, 53, 1.5, Number.NaN]) {
            expect(
                validarRecorrencia({ ...base, intervaloSemanas }),
            ).toMatchObject({ codigo: 'INTERVALO_INVALIDO' });
        }
    });

    test('rejeita data final anterior', () => {
        expect(
            validarRecorrencia({
                ...base,
                criterioParada: 'data',
                dataFinal: '2026-01-04',
            }),
        ).toMatchObject({ codigo: 'DATA_FINAL_ANTERIOR' });
    });

    test('aceita casos válidos sem erro', () => {
        expect(validarRecorrencia(base)).toBeNull();
        expect(
            validarRecorrencia({
                ...base,
                criterioParada: 'data',
                dataFinal: '2026-01-19',
                intervaloSemanas: 52,
            }),
        ).toBeNull();
    });
});
