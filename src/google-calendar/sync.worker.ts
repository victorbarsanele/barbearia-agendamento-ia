import { StatusAgendamento } from '@prisma/client';
import {
    GoogleCalendarApiError,
    type GoogleCalendarAdapter,
} from './google-calendar.adapter';
import { gerarEventId, montarEvento } from './event';
import * as syncRepository from './sync.repository';
import type {
    ItemSincronizacao,
    ResultadoFinalizacao,
} from './sync.repository';

export const INTERVALO_SYNC_GOOGLE_MS = 30_000;
const LIMITE_POR_TICK = 10;
const ESPERA_ENTRE_EVENTOS_MS = 200;
const MAX_TENTATIVAS = 8;
const MAX_BACKOFF_MS = 30 * 60 * 1000;

interface SyncRepository {
    reivindicar(agora: Date, limite: number): Promise<ItemSincronizacao[]>;
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
    adapter: SyncAdapter;
    agora?: () => Date;
    aguardar?: (ms: number) => Promise<void>;
    logError?: (details: { agendamentoId: string; erro: string }) => void;
}

const defaultWait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

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
    let intervalo: NodeJS.Timeout | undefined;
    let tickEmAndamento: Promise<void> | undefined;

    const processarTick = async (): Promise<void> => {
        if (tickEmAndamento) return tickEmAndamento;
        tickEmAndamento = (async () => {
            try {
                const itens = await repository.reivindicar(
                    agora(),
                    LIMITE_POR_TICK,
                );
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
            } finally {
                tickEmAndamento = undefined;
            }
        })();
        return tickEmAndamento;
    };

    intervalo = setInterval(
        () => void processarTick(),
        INTERVALO_SYNC_GOOGLE_MS,
    );
    intervalo.unref();

    return async () => {
        if (intervalo) clearInterval(intervalo);
        intervalo = undefined;
        await tickEmAndamento;
    };
}

export const __testables = {
    LIMITE_POR_TICK,
    ESPERA_ENTRE_EVENTOS_MS,
    MAX_TENTATIVAS,
    MAX_BACKOFF_MS,
};
