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

test('permite estornar conclusão automática quando DTO autoriza', () => {
    expect(podeCancelarAgendamento('AGENDADO', true, true)).toBe(true);
});

test('não permite cancelar conclusão sem autorização de estorno', () => {
    expect(podeCancelarAgendamento('AGENDADO', true, false)).toBe(false);
});

test('não permite estornar agendamento já cancelado', () => {
    expect(podeCancelarAgendamento('CANCELADO', true, true)).toBe(false);
});
