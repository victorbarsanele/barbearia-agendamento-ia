import { test, expect } from '@playwright/test';
import { expandirRecorrencia } from '../src/components/LoteAgendamentoModal/expandirRecorrencia.js';

test('gera ocorrências para um dia da semana', () => {
    expect(
        expandirRecorrencia({
            dataInicial: '2026-01-05',
            diasSelecionados: new Set([1]),
            horarioPorDia: { 1: '10:00' },
            criterioParada: 'ocorrencias',
            dataFinal: '',
            numeroOcorrencias: 3,
        }),
    ).toEqual([
        { data: '2026-01-05', horario: '10:00' },
        { data: '2026-01-12', horario: '10:00' },
        { data: '2026-01-19', horario: '10:00' },
    ]);
});

test('conta slots com segunda e quarta', () => {
    expect(
        expandirRecorrencia({
            dataInicial: '2026-01-05',
            diasSelecionados: new Set([1, 3]),
            horarioPorDia: { 1: '09:00', 3: '11:00' },
            criterioParada: 'ocorrencias',
            dataFinal: '',
            numeroOcorrencias: 4,
        }),
    ).toEqual([
        { data: '2026-01-05', horario: '09:00' },
        { data: '2026-01-07', horario: '11:00' },
        { data: '2026-01-12', horario: '09:00' },
        { data: '2026-01-14', horario: '11:00' },
    ]);
});

test('começa na data inicial quando ela cai no meio da semana', () => {
    expect(
        expandirRecorrencia({
            dataInicial: '2026-01-07',
            diasSelecionados: new Set([1, 3]),
            horarioPorDia: { 1: '09:00', 3: '11:00' },
            criterioParada: 'ocorrencias',
            dataFinal: '',
            numeroOcorrencias: 3,
        }),
    ).toEqual([
        { data: '2026-01-07', horario: '11:00' },
        { data: '2026-01-12', horario: '09:00' },
        { data: '2026-01-14', horario: '11:00' },
    ]);
});

test('para por data final', () => {
    expect(
        expandirRecorrencia({
            dataInicial: '2026-01-05',
            diasSelecionados: new Set([1]),
            horarioPorDia: { 1: '10:00' },
            criterioParada: 'data',
            dataFinal: '2026-01-19',
            numeroOcorrencias: 0,
        }),
    ).toHaveLength(3);
});

test('data final antes da inicial ainda gera primeira data elegível', () => {
    expect(
        expandirRecorrencia({
            dataInicial: '2026-01-05',
            diasSelecionados: new Set([1]),
            horarioPorDia: { 1: '10:00' },
            criterioParada: 'data',
            dataFinal: '2026-01-04',
            numeroOcorrencias: 0,
        }),
    ).toEqual([{ data: '2026-01-05', horario: '10:00' }]);
});

test('mantém teto de 365 dias de varredura', () => {
    const slots = expandirRecorrencia({
        dataInicial: '2026-01-05',
        diasSelecionados: new Set([1]),
        horarioPorDia: { 1: '10:00' },
        criterioParada: 'data',
        dataFinal: '2027-12-31',
        numeroOcorrencias: 0,
    });

    expect(slots).toHaveLength(53);
    expect(slots.at(-1)).toEqual({
        data: '2027-01-04',
        horario: '10:00',
    });
});

test('não gera slot para dia selecionado sem horário', () => {
    expect(
        expandirRecorrencia({
            dataInicial: '2026-01-05',
            diasSelecionados: new Set([1]),
            horarioPorDia: {},
            criterioParada: 'ocorrencias',
            dataFinal: '',
            numeroOcorrencias: 1,
        }),
    ).toEqual([]);
});