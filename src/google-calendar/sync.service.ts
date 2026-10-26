import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getGoogleCalendarConfig } from './config';
import {
    GoogleCalendarAdapter,
    type GoogleCalendarListedEvent,
} from './google-calendar.adapter';
import { montarEvento, type AgendamentoParaEvento } from './event';
import * as syncRepository from './sync.repository';

const TIME_ZONE = 'America/Sao_Paulo';

export async function enfileirarSincronizacao(ids: string[]): Promise<void> {
    if (!getGoogleCalendarConfig().enabled || ids.length === 0) return;

    try {
        await syncRepository.enfileirar([...new Set(ids)]);
    } catch {
        console.error('[GOOGLE CALENDAR] Falha ao enfileirar sincronização.');
    }
}

export function criarGoogleCalendarAdapter(): GoogleCalendarAdapter | null {
    const config = getGoogleCalendarConfig();
    return config.enabled ? new GoogleCalendarAdapter(config) : null;
}

export interface AgendamentoReconciliação extends AgendamentoParaEvento {}

export function calcularIdsDivergentes(
    agendamentos: AgendamentoReconciliação[],
    eventos: GoogleCalendarListedEvent[],
): string[] {
    const porAgendamento = new Map<string, GoogleCalendarListedEvent[]>();
    for (const evento of eventos) {
        const id = evento.extendedProperties?.private?.agendamentoId;
        if (!id) continue;
        const lista = porAgendamento.get(id) ?? [];
        lista.push(evento);
        porAgendamento.set(id, lista);
    }

    const divergentes = new Set<string>();
    const agendamentoPorId = new Map(
        agendamentos.map((agendamento) => [agendamento.id, agendamento]),
    );

    for (const agendamento of agendamentos) {
        const eventosDoAgendamento = porAgendamento.get(agendamento.id) ?? [];
        if (agendamento.status === 'CANCELADO') {
            if (eventosDoAgendamento.length > 0) {
                divergentes.add(agendamento.id);
            }
            continue;
        }

        const esperado = montarEvento(agendamento);
        const correspondente = eventosDoAgendamento[0];
        if (
            !correspondente ||
            correspondente.status === 'cancelled' ||
            correspondente.summary !== esperado.summary ||
            correspondente.description !== esperado.description ||
            !mesmoInstante(
                correspondente.start?.dateTime,
                esperado.start.dateTime,
            ) ||
            !mesmoInstante(correspondente.end?.dateTime, esperado.end.dateTime)
        ) {
            divergentes.add(agendamento.id);
        }
    }

    for (const [id] of porAgendamento) {
        if (!agendamentoPorId.has(id)) divergentes.add(id);
    }

    return [...divergentes];
}

function mesmoInstante(valor: string | undefined, esperado: string): boolean {
    return Boolean(
        valor && new Date(valor).getTime() === new Date(esperado).getTime(),
    );
}

export function obterInicioJanelaReconciliacao(agora = new Date()): Date {
    const local = toZonedTime(agora, TIME_ZONE);
    local.setHours(0, 0, 0, 0);
    local.setDate(local.getDate() - 1);
    return fromZonedTime(local, TIME_ZONE);
}

export async function reconciliarGoogleAgenda(
    adapter: GoogleCalendarAdapter,
    agora = new Date(),
): Promise<string[]> {
    if (!getGoogleCalendarConfig().enabled) return [];

    const janela = obterInicioJanelaReconciliacao(agora);
    const [agendamentos, eventos] = await Promise.all([
        syncRepository.listarAgendamentosDesde(janela),
        adapter.listarEventos(janela),
    ]);
    const ids = calcularIdsDivergentes(agendamentos, eventos);
    await enfileirarSincronizacao(ids);
    return ids;
}

export const INTERVALO_RECONCILIACAO_MS = 6 * 60 * 60 * 1000;
export const ATRASO_RECONCILIACAO_INICIAL_MS = 2 * 60 * 1000;
