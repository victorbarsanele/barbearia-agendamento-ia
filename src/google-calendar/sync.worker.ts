import { StatusAgendamento } from '@prisma/client';
import {
    GoogleCalendarApiError,
    type GoogleCalendarAdapter,
} from './google-calendar.adapter';
import { gerarEventId, montarEvento } from './event';
import * as syncRepository from './sync.repository';
import type {
    AlteracaoOutbox,
    ItemSincronizacao,
    ItemPendenteSincronizacao,
    ResultadoFinalizacao,
} from './sync.repository';

const LIMITE_POR_TICK = 10;
const ESPERA_ENTRE_EVENTOS_MS = 200;
const RETRY_CLAIM_VAZIO_MS = 30_000;
const MAX_TENTATIVAS = 8;
const MAX_BACKOFF_MS = 30 * 60 * 1000;
const DEFAULT_SAFETY_SWEEP_MS = 60 * 60 * 1000;
const MIN_SAFETY_SWEEP_MS = 60 * 1000;

interface SyncRepository {
    reivindicar(agora: Date, limite: number): Promise<ItemSincronizacao[]>;
    listarPendentes(): Promise<ItemPendenteSincronizacao[]>;
    buscarAgendamento(
        agendamentoId: string,
    ): Promise<
        | (Parameters<typeof montarEvento>[0] & { status: StatusAgendamento })
        | null
    >;
    finalizar(
        agendamentoId: string,
        versao: number,
        resultado: ResultadoFinalizacao,
    ): Promise<boolean>;
}

interface SyncAdapter {
    inserirOuReativar: GoogleCalendarAdapter['inserirOuReativar'];
    excluir: GoogleCalendarAdapter['excluir'];
}

interface WorkerDependencies {
    repository?: SyncRepository;
    observarOutbox?: (
        observador: (alteracao: AlteracaoOutbox) => void,
    ) => () => void;
    adapter: SyncAdapter;
    agora?: () => Date;
    aguardar?: (ms: number) => Promise<void>;
    safetySweepMs?: number;
    logError?: (details: { agendamentoId: string; erro: string }) => void;
}

const defaultWait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

function getSafetySweepMs(): number {
    const raw = process.env.GOOGLE_CALENDAR_SAFETY_SWEEP_MS;
    if (raw === undefined || raw.trim() === '') return DEFAULT_SAFETY_SWEEP_MS;

    const configured = Number(raw);
    if (configured === 0) return 0;
    if (!Number.isInteger(configured) || configured < MIN_SAFETY_SWEEP_MS) {
        throw new Error(
            'GOOGLE_CALENDAR_SAFETY_SWEEP_MS inválida: use 0 ou inteiro >= 60000.',
        );
    }
    return configured;
}

export function validarGoogleCalendarWorkerConfig(): void {
    getSafetySweepMs();
}

function classificarFalha(error: unknown): {
    transitório: boolean;
    mensagem: string;
} {
    if (error instanceof GoogleCalendarApiError) {
        return {
            transitório: error.transitório,
            mensagem: error.message,
        };
    }
    return {
        transitório: true,
        mensagem: 'Falha transitória de sincronização.',
    };
}

export async function processarItemSincronizacao(
    item: ItemSincronizacao,
    dependencies: WorkerDependencies,
): Promise<void> {
    const repository = dependencies.repository ?? syncRepository;
    const agora = dependencies.agora ?? (() => new Date());
    const logError =
        dependencies.logError ??
        ((details) =>
            console.error(
                '[GOOGLE CALENDAR] Falha permanente na sincronização.',
                details,
            ));

    try {
        const agendamento = await repository.buscarAgendamento(
            item.agendamentoId,
        );
        if (
            !agendamento ||
            agendamento.status === StatusAgendamento.CANCELADO
        ) {
            await dependencies.adapter.excluir(
                gerarEventId(item.agendamentoId),
            );
        } else {
            await dependencies.adapter.inserirOuReativar(
                montarEvento(agendamento),
            );
        }
    } catch (error) {
        const falha = classificarFalha(error);
        const tentativas = item.tentativas + 1;
        const permanente = !falha.transitório || tentativas >= MAX_TENTATIVAS;
        const proximaTentativaEm = new Date(
            agora().getTime() +
                (permanente
                    ? 0
                    : Math.min(30_000 * 2 ** (tentativas - 1), MAX_BACKOFF_MS)),
        );
        const resultado: ResultadoFinalizacao = {
            status: permanente ? 'ERRO' : 'PENDENTE',
            tentativas,
            proximaTentativaEm,
            ultimoErro: falha.mensagem,
        };
        const finalizado = await repository.finalizar(
            item.agendamentoId,
            item.versao,
            resultado,
        );
        if (permanente && finalizado) {
            logError({
                agendamentoId: item.agendamentoId,
                erro: falha.mensagem,
            });
        }
        return;
    }

    await repository.finalizar(item.agendamentoId, item.versao, {
        status: 'SINCRONIZADO',
        tentativas: 0,
        proximaTentativaEm: agora(),
        ultimoErro: null,
    });
}

export function iniciarWorkerGoogleAgenda(
    adapter: GoogleCalendarAdapter,
    dependencies: Omit<WorkerDependencies, 'adapter'> = {},
): () => Promise<void> {
    const repository = dependencies.repository ?? syncRepository;
    const agora = dependencies.agora ?? (() => new Date());
    const aguardar = dependencies.aguardar ?? defaultWait;
    const safetySweepMs = dependencies.safetySweepMs ?? getSafetySweepMs();
    if (
        safetySweepMs !== 0 &&
        (!Number.isInteger(safetySweepMs) ||
            safetySweepMs < MIN_SAFETY_SWEEP_MS)
    ) {
        throw new Error(
            'GOOGLE_CALENDAR_SAFETY_SWEEP_MS inválida: use 0 ou inteiro >= 60000.',
        );
    }

    const pendentesConhecidos = new Map<string, number>();
    let timerVencimento: NodeJS.Timeout | undefined;
    let timerSeguranca: NodeJS.Timeout | undefined;
    let vencimentoAgendado: number | undefined;
    let tickEmAndamento: Promise<void> | undefined;
    let acordarAposTick = false;
    let encerrando = false;
    let revisao = 0;

    const limparTimerVencimento = (): void => {
        if (timerVencimento) clearTimeout(timerVencimento);
        timerVencimento = undefined;
        vencimentoAgendado = undefined;
    };

    const obterMenorVencimento = (): number =>
        Math.min(...pendentesConhecidos.values());

    const armarVencimento = (vencimento?: number): void => {
        if (encerrando) return;
        const proximo = vencimento ?? obterMenorVencimento();
        if (!Number.isFinite(proximo)) {
            limparTimerVencimento();
            return;
        }
        if (
            timerVencimento &&
            vencimentoAgendado !== undefined &&
            vencimentoAgendado <= proximo
        ) {
            return;
        }

        limparTimerVencimento();
        vencimentoAgendado = proximo;
        timerVencimento = setTimeout(
            () => {
                timerVencimento = undefined;
                vencimentoAgendado = undefined;
                void processarTick().catch(() => undefined);
            },
            Math.max(0, proximo - agora().getTime()),
        );
        timerVencimento.unref();
    };

    const observarAlteracao = (alteracao: AlteracaoOutbox): void => {
        revisao += 1;
        if (alteracao.status === 'PENDENTE') {
            pendentesConhecidos.set(
                alteracao.agendamentoId,
                alteracao.proximaTentativaEm.getTime(),
            );
            const vencimento = alteracao.proximaTentativaEm.getTime();
            if (tickEmAndamento && vencimento <= agora().getTime()) {
                acordarAposTick = true;
            }
        } else {
            pendentesConhecidos.delete(alteracao.agendamentoId);
        }
        armarVencimento();
    };

    const removerObservador = (
        dependencies.observarOutbox ?? syncRepository.observarOutbox
    )(observarAlteracao);

    const atualizarPendentes = async (
        varreduraSeguranca = false,
        atrasoMinimoMs = 0,
    ) => {
        while (!encerrando) {
            const revisaoInicial = revisao;
            const pendentes = await repository.listarPendentes();
            if (encerrando) return;
            if (revisao !== revisaoInicial) continue;

            if (varreduraSeguranca) {
                const naoAgendados = pendentes.filter((item) => {
                    const vencimento = pendentesConhecidos.get(
                        item.agendamentoId,
                    );
                    return vencimento !== item.proximaTentativaEm.getTime();
                });
                if (naoAgendados.length > 0) {
                    console.warn(
                        '[GOOGLE CALENDAR] Varredura encontrou itens sem vencimento agendado.',
                        {
                            evento: 'outbox_sem_vencimento_agendado',
                            quantidade: naoAgendados.length,
                        },
                    );
                }
            }

            pendentesConhecidos.clear();
            for (const item of pendentes) {
                pendentesConhecidos.set(
                    item.agendamentoId,
                    item.proximaTentativaEm.getTime(),
                );
            }
            const menorVencimento = obterMenorVencimento();
            armarVencimento(
                atrasoMinimoMs > 0 && menorVencimento <= agora().getTime()
                    ? agora().getTime() + atrasoMinimoMs
                    : undefined,
            );
            return;
        }
    };

    const processarTick = (): Promise<void> => {
        if (encerrando) return Promise.resolve();
        if (tickEmAndamento) {
            acordarAposTick = true;
            return tickEmAndamento;
        }

        tickEmAndamento = (async () => {
            do {
                acordarAposTick = false;
                let quantidadeReivindicada = 0;
                try {
                    const itens = await repository.reivindicar(
                        agora(),
                        LIMITE_POR_TICK,
                    );
                    quantidadeReivindicada = itens.length;
                    for (const [index, item] of itens.entries()) {
                        await processarItemSincronizacao(item, {
                            ...dependencies,
                            repository,
                            adapter,
                            agora,
                        });
                        if (index < itens.length - 1) {
                            await aguardar(ESPERA_ENTRE_EVENTOS_MS);
                        }
                    }
                } catch {
                    console.error(
                        '[GOOGLE CALENDAR] Falha ao buscar itens pendentes.',
                    );
                }

                try {
                    await atualizarPendentes(
                        false,
                        quantidadeReivindicada === 0 ? RETRY_CLAIM_VAZIO_MS : 0,
                    );
                } catch {
                    console.error(
                        '[GOOGLE CALENDAR] Falha ao atualizar vencimento da outbox.',
                    );
                }

                const proximo = obterMenorVencimento();
                if (
                    !acordarAposTick &&
                    (quantidadeReivindicada < LIMITE_POR_TICK ||
                        !Number.isFinite(proximo) ||
                        proximo > agora().getTime())
                ) {
                    break;
                }
            } while (!encerrando);
        })().finally(() => {
            tickEmAndamento = undefined;
            if (acordarAposTick && !encerrando) {
                armarVencimento(agora().getTime());
            }
        });
        return tickEmAndamento;
    };

    const programarVarreduraSeguranca = (): void => {
        if (encerrando || safetySweepMs === 0) return;
        timerSeguranca = setTimeout(() => {
            timerSeguranca = undefined;
            void atualizarPendentes(true)
                .catch(() =>
                    console.error(
                        '[GOOGLE CALENDAR] Falha na varredura de segurança da outbox.',
                    ),
                )
                .finally(programarVarreduraSeguranca);
        }, safetySweepMs);
        timerSeguranca.unref();
    };

    programarVarreduraSeguranca();
    void atualizarPendentes().catch(() =>
        console.error('[GOOGLE CALENDAR] Falha ao iniciar worker da outbox.'),
    );

    return async () => {
        encerrando = true;
        limparTimerVencimento();
        if (timerSeguranca) clearTimeout(timerSeguranca);
        timerSeguranca = undefined;
        removerObservador();
        await tickEmAndamento;
    };
}

export const __testables = {
    LIMITE_POR_TICK,
    ESPERA_ENTRE_EVENTOS_MS,
    MAX_TENTATIVAS,
    MAX_BACKOFF_MS,
    DEFAULT_SAFETY_SWEEP_MS,
    MIN_SAFETY_SWEEP_MS,
    getSafetySweepMs,
};
