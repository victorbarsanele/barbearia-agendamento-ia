import { EstadoEscalonamento } from '@prisma/client';
import {
    getPendingAgendamentoRepository,
    REMINDER_MIN_EXPIRY_MARGIN_MS,
    registrarObservadorRascunho,
    type PendingAgendamento,
    type PendingAgendamentoChange,
    type PendingAgendamentoSchedule,
} from '../repositories/pending-agendamento.repository';
import { getEscalationStateRepository } from '../repositories/escalation-state.repository';
import { getWhatsAppAllowlist } from '../whatsapp/allowlist';
import { sendWhatsAppText } from '../whatsapp/whatsapp-outbound.service';
import { normalizarTelefone } from '../utils/telefone';
import { addToHistory } from './gemini.service';

const DEFAULT_REMINDER_DELAY_MS = 10 * 60 * 1000;
const DEFAULT_SAFETY_SWEEP_MS = 60 * 60 * 1000;
const MIN_SAFETY_SWEEP_MS = 60 * 1000;
const REMINDER_TEXT =
    'Oi! Ainda está por aí? Seu horário ainda não está marcado: *responda SIM* para confirmar o resumo acima, ou me diga o que mudar.';

let stopReminderScheduler: (() => void) | undefined;
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

function getSafetySweepMs(): number {
    const raw = process.env.PENDING_BOOKING_SAFETY_SWEEP_MS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_SAFETY_SWEEP_MS;

    const configured = Number(raw);
    if (configured === 0) return 0;
    if (!Number.isInteger(configured) || configured < MIN_SAFETY_SWEEP_MS) {
        throw new Error(
            'PENDING_BOOKING_SAFETY_SWEEP_MS inválida: use 0 ou inteiro >= 60000.',
        );
    }
    return configured;
}

export function validarJobLembretesRascunhoConfig(): void {
    getSafetySweepMs();
}

function obterProximoVencimento(
    draft: PendingAgendamentoSchedule,
    agoraMs: number,
): number {
    const expiraEmMs = draft.expiraEm.getTime();
    let vencimento = expiraEmMs + 1;

    if (draft.lembreteEnviadoEm == null) {
        const lembreteEmMs = Math.max(
            draft.criadoEm.getTime() + getReminderDelayMs(),
            agoraMs,
        );
        if (
            draft.dataHoraInicio.getTime() > lembreteEmMs &&
            expiraEmMs >= lembreteEmMs + REMINDER_MIN_EXPIRY_MARGIN_MS
        ) {
            vencimento = Math.min(vencimento, lembreteEmMs);
        }
    }

    return vencimento;
}

function mesmaAgenda(
    left: PendingAgendamentoSchedule,
    right: PendingAgendamentoSchedule,
): boolean {
    return (
        left.criadoEm.getTime() === right.criadoEm.getTime() &&
        left.expiraEm.getTime() === right.expiraEm.getTime() &&
        left.dataHoraInicio.getTime() === right.dataHoraInicio.getTime() &&
        (left.lembreteEnviadoEm?.getTime() ?? null) ===
            (right.lembreteEnviadoEm?.getTime() ?? null)
    );
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
    if (stopReminderScheduler) {
        return () => undefined;
    }

    const safetySweepMs = getSafetySweepMs();
    const repository = getPendingAgendamentoRepository();
    const drafts = new Map<string, PendingAgendamentoSchedule>();
    let reminderTimer: NodeJS.Timeout | undefined;
    let safetyTimer: NodeJS.Timeout | undefined;
    let reminderDueAt: number | undefined;
    let stopped = false;
    let revision = 0;
    let activeCycle: Promise<void> | undefined;

    const clearReminderTimer = (): void => {
        if (reminderTimer) clearTimeout(reminderTimer);
        reminderTimer = undefined;
        reminderDueAt = undefined;
    };

    const armNextDeadline = (): void => {
        if (stopped) return;
        const agora = Date.now();
        const proximo = Math.min(
            ...[...drafts.values()].map((draft) =>
                obterProximoVencimento(draft, agora),
            ),
        );
        if (!Number.isFinite(proximo)) {
            clearReminderTimer();
            return;
        }
        if (
            reminderTimer &&
            reminderDueAt !== undefined &&
            reminderDueAt <= proximo
        ) {
            return;
        }

        clearReminderTimer();
        reminderDueAt = proximo;
        reminderTimer = setTimeout(
            () => {
                reminderTimer = undefined;
                reminderDueAt = undefined;
                void executarCiclo().catch(() =>
                    logCycleFailure('reagendamento'),
                );
            },
            Math.max(0, proximo - Date.now()),
        );
        reminderTimer.unref();
    };

    const tratarAlteracao = (change: PendingAgendamentoChange): void => {
        revision += 1;
        if (change.tipo === 'salvo') {
            drafts.set(change.rascunho.telefoneSessao, change.rascunho);
        } else if (change.tipo === 'removido') {
            drafts.delete(change.telefoneSessao);
        } else if (change.tipo === 'lembrete_reivindicado') {
            const draft = drafts.get(change.telefoneSessao);
            if (draft) {
                drafts.set(change.telefoneSessao, {
                    ...draft,
                    lembreteEnviadoEm: change.agora,
                });
            }
        }
        armNextDeadline();
    };

    const unsubscribe = registrarObservadorRascunho(tratarAlteracao);

    const atualizarPrazos = async (safetySweep = false): Promise<void> => {
        while (!stopped) {
            const revisionAtStart = revision;
            const pendentes = await repository.listarParaAgendamento();
            if (stopped) return;
            if (revision !== revisionAtStart) continue;

            if (safetySweep) {
                const naoAgendados = pendentes.filter((draft) => {
                    const agendado = drafts.get(draft.telefoneSessao);
                    return !agendado || !mesmaAgenda(agendado, draft);
                });
                if (naoAgendados.length > 0) {
                    console.warn(
                        '[PENDING BOOKING JOB] Varredura encontrou rascunho sem vencimento agendado.',
                        {
                            evento: 'rascunho_sem_vencimento_agendado',
                            quantidade: naoAgendados.length,
                        },
                    );
                }
            }

            drafts.clear();
            for (const draft of pendentes) {
                drafts.set(draft.telefoneSessao, draft);
            }
            armNextDeadline();
            return;
        }
    };

    const executarCiclo = (): Promise<void> => {
        if (stopped) return Promise.resolve();
        if (activeCycle) return activeCycle;
        activeCycle = (async () => {
            await processarCicloLembretes();
            await atualizarPrazos();
        })().finally(() => {
            activeCycle = undefined;
        });
        return activeCycle;
    };

    const programarVarreduraSeguranca = (): void => {
        if (stopped || safetySweepMs === 0) return;
        safetyTimer = setTimeout(() => {
            safetyTimer = undefined;
            void atualizarPrazos(true)
                .catch(() => logCycleFailure('varredura_seguranca'))
                .finally(programarVarreduraSeguranca);
        }, safetySweepMs);
        safetyTimer.unref();
    };

    const stop = (): void => {
        stopped = true;
        clearReminderTimer();
        if (safetyTimer) clearTimeout(safetyTimer);
        safetyTimer = undefined;
        unsubscribe();
        stopReminderScheduler = undefined;
    };

    stopReminderScheduler = stop;
    programarVarreduraSeguranca();
    void atualizarPrazos().catch(() => logCycleFailure('inicializacao'));

    return stop;
}

export const __testables = {
    DEFAULT_SAFETY_SWEEP_MS,
    MIN_SAFETY_SWEEP_MS,
    REMINDER_TEXT,
    getReminderDelayMs,
    getSafetySweepMs,
    obterProximoVencimento,
};
