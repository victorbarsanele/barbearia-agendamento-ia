import { createHash } from 'node:crypto';
import { StatusAgendamento } from '@prisma/client';

export interface AgendamentoParaEvento {
    id: string;
    dataHoraInicio: Date;
    dataHoraFim: Date;
    status: StatusAgendamento;
    concluido: boolean;
    cliente: { nome: string; telefone: string };
    servico: { nome: string };
}

export interface GoogleCalendarEvent {
    id: string;
    summary: string;
    description: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    extendedProperties: {
        private: { agendamentoId: string; origem: 'painel-barbearia' };
    };
    reminders: { useDefault: false };
}

export function gerarEventId(agendamentoId: string): string {
    return createHash('sha1').update(agendamentoId).digest('hex');
}

export function montarEvento(
    agendamento: AgendamentoParaEvento,
): GoogleCalendarEvent {
    return {
        id: gerarEventId(agendamento.id),
        summary: `${agendamento.cliente.nome} — ${agendamento.servico.nome}`,
        description: [
            `Telefone: ${agendamento.cliente.telefone}`,
            `Status: ${agendamento.concluido ? 'CONCLUIDO' : agendamento.status}`,
            'Espelho automático do painel. Edições no Google não voltam para o sistema.',
        ].join('\n'),
        start: {
            dateTime: agendamento.dataHoraInicio.toISOString(),
            timeZone: 'America/Sao_Paulo',
        },
        end: {
            dateTime: agendamento.dataHoraFim.toISOString(),
            timeZone: 'America/Sao_Paulo',
        },
        extendedProperties: {
            private: {
                agendamentoId: agendamento.id,
                origem: 'painel-barbearia',
            },
        },
        reminders: { useDefault: false },
    };
}
