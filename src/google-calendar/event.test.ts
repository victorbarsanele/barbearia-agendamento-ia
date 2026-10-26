import { StatusAgendamento } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { gerarEventId, montarEvento } from './event';

const agendamento = {
    id: 'cmg1abc123xyz',
    dataHoraInicio: new Date('2026-10-27T13:00:00.000Z'),
    dataHoraFim: new Date('2026-10-27T13:30:00.000Z'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    cliente: { nome: 'Maria Silva', telefone: '5511999999999' },
    servico: { nome: 'Corte' },
};

describe('eventos Google Agenda', () => {
    it('gera id determinístico em hexadecimal SHA-1', () => {
        const first = gerarEventId(agendamento.id);
        expect(first).toBe(gerarEventId(agendamento.id));
        expect(first).toMatch(/^[0-9a-f]{40}$/);
    });

    it('monta evento com instante ISO, fuso e metadados privados', () => {
        const evento = montarEvento(agendamento);

        expect(evento).toEqual({
            id: gerarEventId(agendamento.id),
            summary: 'Maria Silva — Corte',
            description: expect.stringContaining('5511999999999'),
            start: {
                dateTime: '2026-10-27T13:00:00.000Z',
                timeZone: 'America/Sao_Paulo',
            },
            end: {
                dateTime: '2026-10-27T13:30:00.000Z',
                timeZone: 'America/Sao_Paulo',
            },
            extendedProperties: {
                private: {
                    agendamentoId: agendamento.id,
                    origem: 'painel-barbearia',
                },
            },
            reminders: { useDefault: false },
        });
        expect(evento.description).toContain('AGENDADO');
        expect(evento.description).toContain('Edições no Google não voltam');
        expect(
            montarEvento({ ...agendamento, concluido: true }).description,
        ).toContain('Status: CONCLUIDO');
    });

    it('não escreve telefone ou payload em logs', () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        montarEvento(agendamento);

        expect(log).not.toHaveBeenCalled();
        log.mockRestore();
    });
});
