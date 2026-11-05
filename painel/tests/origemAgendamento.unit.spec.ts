import { expect, test } from '@playwright/test';
import { Bot, Monitor } from 'lucide-react';
import { infoOrigemAgendamento } from '../src/utils/origemAgendamento.js';

test('mapeia origem WhatsApp IA para ícone e rótulo acessível', () => {
    expect(infoOrigemAgendamento('WHATSAPP_IA')).toEqual({
        Icon: Bot,
        label: 'Agendado pelo WhatsApp (IA)',
    });
});

test('mapeia origem painel para ícone e rótulo acessível', () => {
    expect(infoOrigemAgendamento('PAINEL')).toEqual({
        Icon: Monitor,
        label: 'Agendado pelo painel',
    });
});

test('não cria selo para origem nula ou ausente', () => {
    expect(infoOrigemAgendamento(null)).toBeNull();
    expect(infoOrigemAgendamento(undefined)).toBeNull();
});
