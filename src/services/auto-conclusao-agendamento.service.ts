import * as agendamentoRepository from '../repositories/agendamento.repository';
import { enfileirarSincronizacao } from '../google-calendar/sync.service';
import {
    calcularCorteAutoConclusao,
    getAutoConclusaoConfig,
} from '../config/auto-conclusao';
import * as agendamentoService from './agendamento.service';

let autoConclusaoInterval: NodeJS.Timeout | undefined;
let cycleRunning = false;
const MAX_SALDO_ESGOTADO_WARNINGS = 10_000;
const saldoEsgotadoAvisados = new Set<string>();

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

export async function processarCicloAutoConclusao(
    agora = new Date(),
): Promise<void> {
    if (cycleRunning) return;
    const config = getAutoConclusaoConfig();
    if (!config.enabled || !config.aPartirDe) return;

    cycleRunning = true;
    let concluidos = 0;
    let ignorados = 0;
    let falhas = 0;
    let falhasSincronizacao = 0;
    let pendenciasSaldoEsgotado = 0;

    try {
        const corte = calcularCorteAutoConclusao(agora, config.horaLocal);
        const candidatos =
            await agendamentoRepository.listarParaConclusaoAutomatica(
                config.aPartirDe,
                corte,
                config.loteMaximo,
            );

        for (const candidato of candidatos) {
            try {
                const resultado =
                    await agendamentoService.concluirAutomaticamente(
                        {
                            id: candidato.id,
                            pacoteClienteId: candidato.pacoteClienteId,
                            servicoId: candidato.servicoId,
                        },
                        agora,
                        config.aPartirDe,
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
}

export function iniciarJobAutoConclusao(): () => void {
    const config = getAutoConclusaoConfig();
    if (!config.enabled || autoConclusaoInterval) return () => undefined;

    autoConclusaoInterval = setInterval(() => {
        void processarCicloAutoConclusao();
    }, config.intervaloMs);
    autoConclusaoInterval.unref();

    return () => {
        if (!autoConclusaoInterval) return;
        clearInterval(autoConclusaoInterval);
        autoConclusaoInterval = undefined;
    };
}

export const __testables = {
    isCycleRunning: () => cycleRunning,
};
