import { expect, test } from '@playwright/test';
import {
    calcularHorizontePreview,
    validarHorizonteDias,
    validarLimiteAte,
} from '../src/utils/horizonteAgenda.js';

test('usa janela padrão de 20 dias', () => {
    expect(calcularHorizontePreview('2026-10-30', null, null)).toEqual({
        fim: '2026-11-19',
        tetoAtivo: false,
        tetoRestringe: false,
    });
});

test('usa somente janela configurada', () => {
    expect(calcularHorizontePreview('2026-10-30', 45, null).fim).toBe(
        '2026-12-14',
    );
});

test('teto posterior à janela não estende horizonte', () => {
    expect(calcularHorizontePreview('2026-10-30', null, '2026-12-15')).toEqual({
        fim: '2026-11-19',
        tetoAtivo: true,
        tetoRestringe: false,
    });
});

test('janela de 30 dias vence teto antes da data limite e teto depois', () => {
    expect(calcularHorizontePreview('2026-10-30', 30, '2026-12-15').fim).toBe(
        '2026-11-29',
    );
    expect(calcularHorizontePreview('2026-11-20', 30, '2026-12-15').fim).toBe(
        '2026-12-15',
    );
});

test('ignora teto vencido e aceita teto igual a hoje', () => {
    expect(calcularHorizontePreview('2026-10-30', null, '2026-10-29')).toEqual({
        fim: '2026-11-19',
        tetoAtivo: false,
        tetoRestringe: false,
    });
    expect(calcularHorizontePreview('2026-10-30', null, '2026-10-30')).toEqual({
        fim: '2026-10-30',
        tetoAtivo: true,
        tetoRestringe: true,
    });
});

test('soma dias atravessa mês e ano', () => {
    expect(calcularHorizontePreview('2026-12-20', 20, null).fim).toBe(
        '2027-01-09',
    );
});

test('valida janela vazia e rejeita valores fora da faixa ou fracionários', () => {
    expect(validarHorizonteDias('')).toBeNull();
    expect(validarHorizonteDias('1')).toBeNull();
    expect(validarHorizonteDias('180')).toBeNull();
    expect(validarHorizonteDias('0')).toBe(
        'A janela deve ter entre 1 e 180 dias.',
    );
    expect(validarHorizonteDias('181')).toBe(
        'A janela deve ter entre 1 e 180 dias.',
    );
    expect(validarHorizonteDias('1.5')).toBe(
        'Informe um número inteiro de dias.',
    );
});

test('valida teto vazio, passado e além de 180 dias', () => {
    expect(validarLimiteAte('', '2026-10-30')).toBeNull();
    expect(validarLimiteAte('2026-10-29', '2026-10-30')).toBe(
        'O teto não pode ser anterior a hoje.',
    );
    expect(validarLimiteAte('2027-04-29', '2026-10-30')).toBe(
        'O teto não pode ultrapassar 180 dias à frente.',
    );
    expect(validarLimiteAte('2027-04-28', '2026-10-30')).toBeNull();
});
