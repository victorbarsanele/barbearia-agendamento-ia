import { StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import {
    notificarAutoConclusao,
    observarAutoConclusao,
    type AlteracaoAutoConclusao,
    type SnapshotAutoConclusao,
} from '../lib/auto-conclusao-events';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import { enfileirarSincronizacao } from '../google-calendar/sync.service';
import {
    calcularCorteAutoConclusao,
    calcularProximoVencimentoAutoConclusao,
    getAutoConclusaoConfig,
} from '../config/auto-conclusao';
import * as agendamentoService from './agendamento.service';

let cycleRunning = false;
let autoConclusaoStop: (() => void) | undefined;
const MAX_SALDO_ESGOTADO_WARNINGS = 10_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const saldoEsgotadoAvisados = new Set<string>();

type CandidatoConclusao = {
    id: string;
    pacoteClienteId: string;
    servicoId: string;
};

interface OpcoesJobAutoConclusao {
    listarPendentes?: (aPartirDe: Date) => Promise<SnapshotAutoConclusao[]>;
    observar?: (
        observador: (alteracao: AlteracaoAutoConclusao) => void,
    ) => () => void;
    agora?: () => Date;
    safetySweepMs?: number;
}

function avisarSaldoEsgotado(
    agendamentoId: string,
    pacoteClienteId: string,
    servicoId: string,
): void {
    if (saldoEsgotadoAvisados.has(agendamentoId)) return;

    if (saldoEsgotadoAvisados.size >= MAX_SALDO_ESGOTADO_WARNINGS) {
        const maisAntigo = saldoEsgotadoAvisados.values().next().value;
        if (maisAntigo !== undefined) saldoEsgotadoAvisados.delete(maisAntigo);
    }
    saldoEsgotadoAvisados.add(agendamentoId);
    console.warn('[AUTO CONCLUSAO] Saldo esgotado.', {
        evento: 'saldo_esgotado',
        agendamentoId,
        pacoteClienteId,
        servicoId,
    });
}

async function processarCandidatosAutoConclusao(
    candidatos: CandidatoConclusao[],
    agora: Date,
    config: ReturnType<typeof getAutoConclusaoConfig>,
): Promise<string[]> {
    if (cycleRunning) return [];
    cycleRunning = true;
    const tentados: string[] = [];
    let concluidos = 0;
    let ignorados = 0;
    let falhas = 0;
    let falhasSincronizacao = 0;
    let pendenciasSaldoEsgotado = 0;

    try {
        const corte = calcularCorteAutoConclusao(agora, config.horaLocal);
        for (const candidato of candidatos) {
            tentados.push(candidato.id);
            try {
                const resultado =
                    await agendamentoService.concluirAutomaticamente(
                        {
                            id: candidato.id,
                            pacoteClienteId: candidato.pacoteClienteId,
                            servicoId: candidato.servicoId,
                        },
                        agora,
                        config.aPartirDe!,
                        corte,
                    );

                if (resultado.estado === 'SALDO_ESGOTADO') {
                    pendenciasSaldoEsgotado += 1;
                    avisarSaldoEsgotado(
                        candidato.id,
                        candidato.pacoteClienteId,
                        candidato.servicoId,
                    );
                } else if (resultado.estado === 'IGNORADO') {
                    ignorados += 1;
                } else {
                    concluidos += 1;
                    notificarAutoConclusao({
                        tipo: 'agendamento-removido',
                        agendamentoId: candidato.id,
                    });
                    const statusPacote = resultado.pacoteCliente?.status;
                    if (statusPacote) {
                        notificarAutoConclusao({
                            tipo: 'pacote-cliente',
                            pacoteClienteId: candidato.pacoteClienteId,
                            status: statusPacote,
                        });
                    }
                    try {
                        await enfileirarSincronizacao([candidato.id]);
                    } catch {
                        falhasSincronizacao += 1;
                        console.error(
                            '[AUTO CONCLUSAO] Falha ao enfileirar sincronização Google.',
                            { agendamentoId: candidato.id },
                        );
                    }
                }
            } catch (error) {
                falhas += 1;
                console.error('[AUTO CONCLUSAO] Falha no agendamento.', {
                    evento: 'falha_agendamento',
                    agendamentoId: candidato.id,
                    erro:
                        error instanceof Error
                            ? error.message
                            : 'Erro desconhecido.',
                });
            }
        }

        console.info('[AUTO CONCLUSAO] Ciclo finalizado.', {
            evento: 'ciclo_finalizado',
            candidatos: candidatos.length,
            concluidos,
            ignorados,
            falhas,
            falhasSincronizacao,
            pendenciasSaldoEsgotado,
        });
    } catch (error) {
        console.error('[AUTO CONCLUSAO] Falha ao listar candidatos.', {
            evento: 'falha_ciclo',
            erro: error instanceof Error ? error.message : 'Erro desconhecido.',
        });
    } finally {
        cycleRunning = false;
    }
    return tentados;
}

export async function processarCicloAutoConclusao(
    agora = new Date(),
): Promise<void> {
    const config = getAutoConclusaoConfig();
    if (!config.enabled || !config.aPartirDe) return;

    try {
        const corte = calcularCorteAutoConclusao(agora, config.horaLocal);
        const candidatos =
            await agendamentoRepository.listarParaConclusaoAutomatica(
                config.aPartirDe,
                corte,
                config.loteMaximo,
            );
        await processarCandidatosAutoConclusao(candidatos, agora, config);
    } catch (error) {
        console.error('[AUTO CONCLUSAO] Falha ao listar candidatos.', {
            evento: 'falha_ciclo',
            erro: error instanceof Error ? error.message : 'Erro desconhecido.',
        });
    }
}

function ehPendenteElegivel(
    agendamento: SnapshotAutoConclusao,
    aPartirDe: Date,
): boolean {
    return (
        Boolean(agendamento.pacoteClienteId) &&
        !agendamento.concluido &&
        agendamento.status !== StatusAgendamento.CANCELADO &&
        agendamento.dataHoraInicio >= aPartirDe
    );
}

export function iniciarJobAutoConclusao(
    opcoes: OpcoesJobAutoConclusao = {},
): () => void {
    const config = getAutoConclusaoConfig();
    if (!config.enabled || !config.aPartirDe || autoConclusaoStop) {
        return () => undefined;
    }

    const agora = opcoes.agora ?? (() => new Date());
    const listarPendentes =
        opcoes.listarPendentes ??
        agendamentoRepository.listarPendentesParaAgendamentoAutoConclusao;
    const safetySweepMs = opcoes.safetySweepMs ?? config.safetySweepMs;
    const snapshots = new Map<string, SnapshotAutoConclusao>();
    const adiados = new Set<string>();
    let timerVencimento: NodeJS.Timeout | undefined;
    let timerSeguranca: NodeJS.Timeout | undefined;
    let vencimentoAgendado: number | undefined;
    let encerrando = false;
    let executando = false;
    let executarNovamente = false;
    let varrendo = false;
    let eventosDuranteVarredura: AlteracaoAutoConclusao[] = [];

    const vencimentoDe = (agendamento: SnapshotAutoConclusao) => {
        if (
            agendamento.statusPacoteCliente !== StatusPacoteCliente.ATIVO ||
            !ehPendenteElegivel(agendamento, config.aPartirDe!)
        ) {
            return undefined;
        }
        return calcularProximoVencimentoAutoConclusao(
            agendamento.dataHoraFim,
            config.horaLocal,
        ).getTime();
    };

    const aplicarAlteracao = (alteracao: AlteracaoAutoConclusao): void => {
        if (alteracao.tipo === 'agendamento-removido') {
            snapshots.delete(alteracao.agendamentoId);
            adiados.delete(alteracao.agendamentoId);
            return;
        }
        if (alteracao.tipo === 'pacote-cliente') {
            for (const [id, agendamento] of snapshots) {
                if (agendamento.pacoteClienteId !== alteracao.pacoteClienteId) {
                    continue;
                }
                snapshots.set(id, {
                    ...agendamento,
                    statusPacoteCliente: alteracao.status,
                });
                adiados.delete(id);
            }
            return;
        }

        const agendamento = alteracao.agendamento;
        if (!ehPendenteElegivel(agendamento, config.aPartirDe!)) {
            snapshots.delete(agendamento.id);
            adiados.delete(agendamento.id);
            return;
        }
        const anterior = snapshots.get(agendamento.id);
        const statusPacoteCliente =
            agendamento.statusPacoteCliente !== undefined
                ? agendamento.statusPacoteCliente
                : anterior?.pacoteClienteId === agendamento.pacoteClienteId
                  ? anterior.statusPacoteCliente
                  : StatusPacoteCliente.ATIVO;
        snapshots.set(agendamento.id, {
            ...agendamento,
            statusPacoteCliente,
        });
        adiados.delete(agendamento.id);
    };

    const calcularMenorVencimento = (): number => {
        let menor = Number.POSITIVE_INFINITY;
        for (const [id, agendamento] of snapshots) {
            if (adiados.has(id)) continue;
            const vencimento = vencimentoDe(agendamento);
            if (vencimento !== undefined && vencimento < menor) {
                menor = vencimento;
            }
        }
        return menor;
    };

    const limparTimerVencimento = (): void => {
        if (timerVencimento) clearTimeout(timerVencimento);
        timerVencimento = undefined;
        vencimentoAgendado = undefined;
    };

    const armarVencimento = (): void => {
        if (encerrando) return;
        const proximo = calcularMenorVencimento();
        if (!Number.isFinite(proximo)) {
            limparTimerVencimento();
            return;
        }
        if (timerVencimento && vencimentoAgendado === proximo) return;

        limparTimerVencimento();
        vencimentoAgendado = proximo;
        timerVencimento = setTimeout(
            () => {
                timerVencimento = undefined;
                if (proximo > agora().getTime()) {
                    armarVencimento();
                    return;
                }
                vencimentoAgendado = undefined;
                void executarVarredura(false);
            },
            Math.min(MAX_TIMEOUT_MS, Math.max(0, proximo - agora().getTime())),
        );
        timerVencimento.unref();
    };

    const receberAlteracao = (alteracao: AlteracaoAutoConclusao): void => {
        if (encerrando) return;
        aplicarAlteracao(alteracao);
        if (varrendo) eventosDuranteVarredura.push(alteracao);
        armarVencimento();
    };

    const removerObservador = (opcoes.observar ?? observarAutoConclusao)(
        receberAlteracao,
    );

    const programarVarreduraSeguranca = (): void => {
        if (encerrando || safetySweepMs === 0) return;
        timerSeguranca = setTimeout(() => {
            timerSeguranca = undefined;
            void executarVarredura(true).finally(programarVarreduraSeguranca);
        }, safetySweepMs);
        timerSeguranca.unref();
    };

    async function executarVarredura(
        varreduraSeguranca: boolean,
    ): Promise<void> {
        if (encerrando) return;
        if (executando) {
            executarNovamente = true;
            return;
        }
        executando = true;
        let varreduraPendente = varreduraSeguranca;

        do {
            executarNovamente = false;
            if (encerrando) break;
            const corte = calcularCorteAutoConclusao(agora(), config.horaLocal);
            const timerAntesDaVarredura = vencimentoAgendado;
            const anteriores = new Map(snapshots);
            varrendo = true;
            eventosDuranteVarredura = [];

            let encontrados: SnapshotAutoConclusao[];
            try {
                encontrados = await listarPendentes(config.aPartirDe!);
            } catch (error) {
                varrendo = false;
                console.error(
                    '[AUTO CONCLUSAO] Falha ao atualizar vencimentos.',
                    {
                        evento: 'falha_atualizar_vencimentos',
                        erro:
                            error instanceof Error
                                ? error.message
                                : 'Erro desconhecido.',
                    },
                );
                for (const [id, agendamento] of snapshots) {
                    if (
                        vencimentoDe(agendamento) !== undefined &&
                        vencimentoDe(agendamento)! <= agora().getTime()
                    ) {
                        adiados.add(id);
                    }
                }
                armarVencimento();
                break;
            }
            varrendo = false;
            if (encerrando) break;

            if (varreduraPendente) {
                const naoAgendados = encontrados.filter((agendamento) => {
                    const vencimento = vencimentoDe(agendamento);
                    if (vencimento === undefined) return false;
                    const anterior = anteriores.get(agendamento.id);
                    const vencimentoAnterior = anterior
                        ? vencimentoDe(anterior)
                        : undefined;
                    return (
                        (vencimento <= agora().getTime() &&
                            vencimentoAnterior !== vencimento) ||
                        (vencimentoAnterior === undefined &&
                            (timerAntesDaVarredura === undefined ||
                                vencimento < timerAntesDaVarredura)) ||
                        (adiados.has(agendamento.id) &&
                            vencimento <= agora().getTime())
                    );
                });
                if (naoAgendados.length > 0) {
                    console.warn(
                        '[AUTO CONCLUSAO] Varredura encontrou vencimentos não agendados.',
                        {
                            evento: 'auto_conclusao_sem_vencimento_agendado',
                            quantidade: naoAgendados.length,
                        },
                    );
                }
            }

            snapshots.clear();
            for (const agendamento of encontrados) {
                aplicarAlteracao({ tipo: 'agendamento', agendamento });
            }
            for (const alteracao of eventosDuranteVarredura) {
                aplicarAlteracao(alteracao);
            }
            eventosDuranteVarredura = [];

            if (varreduraPendente) adiados.clear();
            varreduraPendente = false;

            const agoraCiclo = agora();
            const corteAtual = calcularCorteAutoConclusao(
                agoraCiclo,
                config.horaLocal,
            );
            const candidatos = [...snapshots.values()]
                .filter(
                    (agendamento) =>
                        vencimentoDe(agendamento) !== undefined &&
                        agendamento.dataHoraFim < corteAtual,
                )
                .sort(
                    (a, b) =>
                        a.dataHoraFim.getTime() - b.dataHoraFim.getTime() ||
                        a.id.localeCompare(b.id),
                )
                .slice(0, config.loteMaximo)
                .map((agendamento) => ({
                    id: agendamento.id,
                    pacoteClienteId: agendamento.pacoteClienteId!,
                    servicoId: agendamento.servicoId,
                }));

            const tentados = await processarCandidatosAutoConclusao(
                candidatos,
                agoraCiclo,
                config,
            );
            for (const id of tentados) {
                const agendamento = snapshots.get(id);
                const vencimento = agendamento
                    ? vencimentoDe(agendamento)
                    : undefined;
                if (
                    vencimento !== undefined &&
                    vencimento <= agora().getTime()
                ) {
                    adiados.add(id);
                }
            }
            armarVencimento();
        } while (executarNovamente && !encerrando);

        executando = false;
        armarVencimento();
    }

    const parar = (): void => {
        if (encerrando) return;
        encerrando = true;
        limparTimerVencimento();
        if (timerSeguranca) clearTimeout(timerSeguranca);
        timerSeguranca = undefined;
        removerObservador();
        if (autoConclusaoStop === parar) autoConclusaoStop = undefined;
    };

    autoConclusaoStop = parar;
    programarVarreduraSeguranca();
    void executarVarredura(false);

    return parar;
}

export const __testables = {
    isCycleRunning: () => cycleRunning,
};
