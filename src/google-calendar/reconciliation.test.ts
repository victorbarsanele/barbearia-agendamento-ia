import { StatusAgendamento } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { montarEvento } from './event';
import {
    calcularIdsDivergentes,
    obterInicioJanelaReconciliacao,
} from './sync.service';

const agendamento = {
    id: 'agendamento-1',
    dataHoraInicio: new Date('2026-10-27T13:00:00.000Z'),
    dataHoraFim: new Date('2026-10-27T13:30:00.000Z'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    cliente: { nome: 'Maria', telefone: '5511999999999' },
    servico: { nome: 'Corte' },
};

describe('reconciliação Google Agenda', () => {
    const eventoAtivo = montarEvento(agendamento);
    const lapide = {
        ...eventoAtivo,
        status: 'cancelled',
    };

    it('enfileira agendamento sem evento, evento divergente e evento órfão', () => {
        const correspondente = eventoAtivo;
        const divergente = {
            ...correspondente,
            summary: 'Nome antigo — Corte',
        };
        const órfão = {
            ...correspondente,
            id: 'event-orphan',
            extendedProperties: {
                private: {
                    agendamentoId: 'apagado-1',
                    origem: 'painel-barbearia' as const,
                },
            },
        };

        expect(
            calcularIdsDivergentes(
                [
                    agendamento,
                    { ...agendamento, id: 'sem-evento' },
                    { ...agendamento, id: 'nome-antigo' },
                ],
                [correspondente, divergente, órfão],
            ),
        ).toEqual(['sem-evento', 'nome-antigo', 'apagado-1']);
    });

    it('ignora lápide para agendamento cancelado', () => {
        expect(
            calcularIdsDivergentes(
                [{ ...agendamento, status: StatusAgendamento.CANCELADO }],
                [lapide],
            ),
        ).toEqual([]);
    });

    it('trata lápide como evento ausente para agendamento ativo', () => {
        expect(calcularIdsDivergentes([agendamento], [lapide])).toEqual([
            agendamento.id,
        ]);
    });

    it('ignora lápide órfã', () => {
        const lápideÓrfã = {
            ...lapide,
            extendedProperties: {
                private: {
                    agendamentoId: 'apagado-1',
                    origem: 'painel-barbearia' as const,
                },
            },
        };

        expect(calcularIdsDivergentes([], [lápideÓrfã])).toEqual([]);
    });

    it('enfileira agendamento cancelado que ainda tem evento ativo', () => {
        expect(
            calcularIdsDivergentes(
                [{ ...agendamento, status: StatusAgendamento.CANCELADO }],
                [eventoAtivo],
            ),
        ).toEqual([agendamento.id]);
    });

    it('enfileira evento ativo órfão', () => {
        const eventoÓrfão = {
            ...eventoAtivo,
            id: 'event-orphan',
            extendedProperties: {
                private: {
                    agendamentoId: 'apagado-1',
                    origem: 'painel-barbearia' as const,
                },
            },
        };

        expect(calcularIdsDivergentes([], [eventoÓrfão])).toEqual([
            'apagado-1',
        ]);
    });

    it('evento ativo prevalece sobre lápide do mesmo agendamento', () => {
        expect(
            calcularIdsDivergentes([agendamento], [lapide, eventoAtivo]),
        ).toEqual([]);
    });

    it('inicia janela no começo do dia anterior em São Paulo', () => {
        expect(
            obterInicioJanelaReconciliacao(
                new Date('2026-10-26T12:00:00.000Z'),
            ).toISOString(),
        ).toBe('2026-10-25T03:00:00.000Z');
    });
});
