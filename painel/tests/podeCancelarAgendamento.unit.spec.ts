import { expect, test } from '@playwright/test';
import { podeCancelarAgendamento } from '../src/utils/podeCancelarAgendamento.js';

test('rejeita agendamento cancelado', () => {
    expect(podeCancelarAgendamento('CANCELADO', false)).toBe(false);
});

test('rejeita agendamento com status concluído', () => {
    expect(podeCancelarAgendamento('CONCLUIDO', false)).toBe(false);
});

test('rejeita agendamento marcado como concluído', () => {
    expect(podeCancelarAgendamento('AGENDADO', true)).toBe(false);
});

test('permite agendamento agendado não concluído', () => {
    expect(podeCancelarAgendamento('AGENDADO', false)).toBe(true);
});

test('permite agendamento confirmado não concluído', () => {
    expect(podeCancelarAgendamento('CONFIRMADO', false)).toBe(true);
});