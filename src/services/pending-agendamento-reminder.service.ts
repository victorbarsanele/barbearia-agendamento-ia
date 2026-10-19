import { EstadoEscalonamento } from '@prisma/client';
import {
    getPendingAgendamentoRepository,
    type PendingAgendamento,
} from '../repositories/pending-agendamento.repository';
import { getEscalationStateRepository } from '../repositories/escalation-state.repository';
import { getWhatsAppAllowlist } from '../whatsapp/allowlist';
import { sendWhatsAppText } from '../whatsapp/whatsapp-outbound.service';
import { normalizarTelefone } from '../utils/telefone';
import { addToHistory } from './gemini.service';

const DEFAULT_REMINDER_DELAY_MS = 10 * 60 * 1000;
const REMINDER_INTERVAL_MS = 60 * 1000;
const REMINDER_TEXT =
    'Oi! Ainda está por aí? Seu horário ainda não está marcado: *responda SIM* para confirmar o resumo acima, ou me diga o que mudar.';

let reminderInterval: NodeJS.Timeout | undefined;
let cycleRunning = false;

function getReminderDelayMs(): number {
    const configured = Number(
        process.env.PENDING_BOOKING_REMINDER_DELAY_MS ??
            DEFAULT_REMINDER_DELAY_MS,
    );
    return Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_REMINDER_DELAY_MS;
}

function logCycleFailure(phase: string): void {
    console.error('[PENDING BOOKING JOB] Falha no ciclo de rascunhos.', {
        evento: 'falha_ciclo_rascunhos',
        fase: phase,
    });
}

function logDraftFailure(event: string): void {
    console.error('[PENDING BOOKING JOB] Falha ao processar rascunho.', {
        evento: event,
    });
}

async function removerExpirados(
    drafts: PendingAgendamento[],
    agora: Date,
): Promise<void> {
    const repository = getPendingAgendamentoRepository();
    for (const draft of drafts) {
        try {
            const apagado = await repository.apagarExpirado(
                draft.telefoneSessao,
                agora,
            );
            if (!apagado) continue;

            console.info('[GEMINI TOOL] rascunho_expirado', {
                evento: 'rascunho_expirado',
                lembreteEnviado: draft.lembreteEnviadoEm != null,
                idadeSegundos: Math.max(
                    0,
                    Math.floor(
                        (agora.getTime() - draft.criadoEm.getTime()) / 1000,
                    ),
                ),
            });
        } catch {
            logDraftFailure('falha_ao_apagar_expirado');
        }
    }
}

async function enviarLembretes(
    drafts: PendingAgendamento[],
    agora: Date,
): Promise<void> {
    const repository = getPendingAgendamentoRepository();
    for (const draft of drafts) {
        try {
            if (
                !(await repository.reivindicarLembrete(
                    draft.telefoneSessao,
                    agora,
                ))
            ) {
                continue;
            }

            const telefone = normalizarTelefone(draft.telefoneSessao);
            if (!telefone) continue;

            const estado = await getEscalationStateRepository().obter(
                telefone,
                agora,
            );
            if (estado && estado.estado !== EstadoEscalonamento.BOT) {
                continue;
            }

            const allowlist = getWhatsAppAllowlist();
            if (allowlist.active && !allowlist.phones.has(telefone)) {
                continue;
            }

            await sendWhatsAppText(telefone, REMINDER_TEXT);
            addToHistory(telefone, 'model', REMINDER_TEXT);
        } catch {
            logDraftFailure('falha_ao_enviar_lembrete');
        }
    }
}

export async function processarCicloLembretes(
    agora = new Date(),
): Promise<void> {
    if (cycleRunning) return;
    cycleRunning = true;

    try {
        const repository = getPendingAgendamentoRepository();
        try {
            const expirados = await repository.listarExpirados(agora);
            await removerExpirados(expirados, agora);
        } catch {
            logCycleFailure('listar_expirados');
        }

        try {
            const elegiveis = await repository.listarElegiveisParaLembrete(
                agora,
                new Date(agora.getTime() - getReminderDelayMs()),
            );
            await enviarLembretes(elegiveis, agora);
        } catch {
            logCycleFailure('listar_lembretes');
        }
    } finally {
        cycleRunning = false;
    }
}

export function iniciarJobLembretesRascunho(): () => void {
    if (reminderInterval) {
        return () => undefined;
    }

    reminderInterval = setInterval(() => {
        void processarCicloLembretes();
    }, REMINDER_INTERVAL_MS);
    reminderInterval.unref();

    return () => {
        if (!reminderInterval) return;
        clearInterval(reminderInterval);
        reminderInterval = undefined;
    };
}

export const __testables = {
    REMINDER_INTERVAL_MS,
    REMINDER_TEXT,
    getReminderDelayMs,
};
