import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getGoogleCalendarConfig } from './config';
import {
    GoogleCalendarAdapter,
    type GoogleCalendarListedEvent,
} from './google-calendar.adapter';
import { montarEvento, type AgendamentoParaEvento } from './event';
import * as syncRepository from './sync.repository';
import { TAMANHO_LOTE_ENFILEIRAMENTO } from './sync.repository';
import { descreverErroSeguro } from './safe-error';

const TIME_ZONE = 'America/Sao_Paulo';

export interface ResultadoEnfileiramentoSincronizacao {
    total: number;
    falhas: number;
}

export async function enfileirarSincronizacao(
    ids: string[],
): Promise<ResultadoEnfileiramentoSincronizacao> {
    const idsUnicos = [...new Set(ids)];
    if (!getGoogleCalendarConfig().enabled || idsUnicos.length === 0) {
        return { total: 0, falhas: 0 };
    }

    try {
        const resultado = await syncRepository.enfileirar(idsUnicos);
        for (const falha of resultado.lotesFalhos) {
            console.error(
                '[GOOGLE CALENDAR] Falha ao enfileirar sincronização.',
                {
                    ...descreverErroSeguro(falha.erro),
                    quantidadeIds: falha.quantidadeIds,
                    indiceLote: falha.indiceLote,
                    totalLotes: falha.totalLotes,
                    duracaoMs: falha.duracaoMs,
                },
            );
        }
        return { total: resultado.total, falhas: resultado.falhas };
    } catch (erro) {
        const totalLotes = Math.ceil(
            idsUnicos.length / TAMANHO_LOTE_ENFILEIRAMENTO,
        );
        console.error('[GOOGLE CALENDAR] Falha ao enfileirar sincronização.', {
            ...descreverErroSeguro(erro),
            quantidadeIds: idsUnicos.length,
            indiceLote: 0,
            totalLotes,
            duracaoMs: 0,
        });
        return { total: idsUnicos.length, falhas: idsUnicos.length };
    }
}

export function criarGoogleCalendarAdapter(): GoogleCalendarAdapter | null {
    const config = getGoogleCalendarConfig();
    return config.enabled ? new GoogleCalendarAdapter(config) : null;
}

export interface AgendamentoReconciliação extends AgendamentoParaEvento {}

export interface ResultadoReconciliação {
    sucesso: boolean;
    agendamentosConsiderados: number;
    eventosListados: number;
    divergentes: number;
    enfileirados: number;
    falhas: number;
    duracaoMs: number;
}

export function calcularIdsDivergentes(
    agendamentos: AgendamentoReconciliação[],
    eventos: GoogleCalendarListedEvent[],
): string[] {
    const porAgendamento = new Map<string, GoogleCalendarListedEvent[]>();
    for (const evento of eventos) {
        if (evento.status === 'cancelled') continue;
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
): Promise<ResultadoReconciliação> {
    const inicio = Date.now();
    const resumo: ResultadoReconciliação = {
        sucesso: false,
        agendamentosConsiderados: 0,
        eventosListados: 0,
        divergentes: 0,
        enfileirados: 0,
        falhas: 0,
        duracaoMs: 0,
    };

    try {
        if (!getGoogleCalendarConfig().enabled) {
            resumo.sucesso = true;
            return resumo;
        }

        const janela = obterInicioJanelaReconciliacao(agora);
        const [agendamentos, eventos] = await Promise.all([
            syncRepository.listarAgendamentosDesde(janela),
            adapter.listarEventos(janela),
        ]);
        resumo.agendamentosConsiderados = agendamentos.length;
        resumo.eventosListados = eventos.length;
        const ids = calcularIdsDivergentes(agendamentos, eventos);
        resumo.divergentes = ids.length;

        const resultadoFila = await enfileirarSincronizacao(ids);
        resumo.enfileirados = resultadoFila.total - resultadoFila.falhas;
        resumo.falhas = resultadoFila.falhas;
        resumo.sucesso = resultadoFila.falhas === 0;
        return resumo;
    } catch (erro) {
        resumo.falhas = Math.max(resumo.falhas, 1);
        throw erro;
    } finally {
        resumo.duracaoMs = Date.now() - inicio;
        console.log('[GOOGLE CALENDAR] Resumo da reconciliação.', {
            agendamentosConsiderados: resumo.agendamentosConsiderados,
            eventosListados: resumo.eventosListados,
            divergentes: resumo.divergentes,
            enfileirados: resumo.enfileirados,
            falhas: resumo.falhas,
            duracaoMs: resumo.duracaoMs,
        });
    }
}

export const INTERVALO_RECONCILIACAO_MS = 6 * 60 * 60 * 1000;
export const ATRASO_RECONCILIACAO_INICIAL_MS = 2 * 60 * 1000;
