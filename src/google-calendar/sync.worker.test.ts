import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarApiError } from './google-calendar.adapter';
import {
    iniciarWorkerGoogleAgenda,
    processarItemSincronizacao,
    __testables,
} from './sync.worker';
import type {
    AlteracaoOutbox,
    ItemPendenteSincronizacao,
} from './sync.repository';

const base = new Date('2026-10-26T12:00:00.000Z');
const item = { agendamentoId: 'agendamento-1', tentativas: 0, versao: 3 };
const agendamento = {
    id: item.agendamentoId,
    dataHoraInicio: new Date('2026-10-27T13:00:00.000Z'),
    dataHoraFim: new Date('2026-10-27T13:30:00.000Z'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    cliente: { nome: 'Maria', telefone: '5511999999999' },
    servico: { nome: 'Corte' },
};

const instanteBase = new Date('2026-10-26T12:00:00.000Z');

type RegistroPendente = {
    agendamentoId: string;
    tentativas: number;
    versao: number;
    proximaTentativaEm: Date;
};

const workers: (() => Promise<void>)[] = [];

afterEach(async () => {
    await Promise.all(workers.splice(0).map((stop) => stop()));
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

function criarWorker(
    registrosIniciais: RegistroPendente[] = [],
    safetySweepMs = 0,
    inserirOuReativar = vi.fn().mockResolvedValue(undefined),
) {
    const registros = registrosIniciais.map((registro) => ({
        ...registro,
        proximaTentativaEm: new Date(registro.proximaTentativaEm),
    }));
    let notificar: ((alteracao: AlteracaoOutbox) => void) | undefined;
    const repository = {
        reivindicar: vi.fn(async (agora: Date, limite: number) => {
            const elegiveis = registros
                .filter((registro) => registro.proximaTentativaEm <= agora)
                .sort(
                    (a, b) =>
                        a.proximaTentativaEm.getTime() -
                        b.proximaTentativaEm.getTime(),
                )
                .slice(0, limite);
            for (const registro of elegiveis) {
                registro.proximaTentativaEm = new Date(
                    agora.getTime() + 2 * 60_000,
                );
            }
            return elegiveis.map(({ agendamentoId, tentativas, versao }) => ({
                agendamentoId,
                tentativas,
                versao,
            }));
        }),
        listarPendentes: vi.fn(
            async (): Promise<ItemPendenteSincronizacao[]> =>
                registros.map(({ agendamentoId, proximaTentativaEm }) => ({
                    agendamentoId,
                    proximaTentativaEm: new Date(proximaTentativaEm),
                })),
        ),
        buscarAgendamento: vi.fn().mockResolvedValue(agendamento),
        finalizar: vi.fn(
            async (
                agendamentoId: string,
                _versao: number,
                resultado: {
                    status: 'SINCRONIZADO' | 'PENDENTE' | 'ERRO';
                    tentativas: number;
                    proximaTentativaEm: Date;
                    ultimoErro: string | null;
                },
            ) => {
                const index = registros.findIndex(
                    (registro) => registro.agendamentoId === agendamentoId,
                );
                if (index < 0) return false;
                if (resultado.status === 'PENDENTE') {
                    registros[index].tentativas = resultado.tentativas;
                    registros[index].proximaTentativaEm =
                        resultado.proximaTentativaEm;
                } else {
                    registros.splice(index, 1);
                }
                return true;
            },
        ),
    };
    const adapter = {
        inserirOuReativar,
        excluir: vi.fn().mockResolvedValue(undefined),
    };
    const stop = iniciarWorkerGoogleAgenda(adapter as never, {
        repository: repository as never,
        agora: () => new Date(Date.now()),
        aguardar: async () => undefined,
        safetySweepMs,
        observarOutbox: (observador) => {
            notificar = observador;
            return () => {
                notificar = undefined;
            };
        },
    });
    workers.push(stop);

    return {
        adapter,
        repository,
        registros,
        notificar(alteracao: AlteracaoOutbox) {
            notificar?.(alteracao);
        },
        adicionar(registro: RegistroPendente, notificarEvento = true) {
            registros.push({
                ...registro,
                proximaTentativaEm: new Date(registro.proximaTentativaEm),
            });
            if (notificarEvento) {
                notificar?.({
                    agendamentoId: registro.agendamentoId,
                    status: 'PENDENTE',
                    proximaTentativaEm: registro.proximaTentativaEm,
                });
            }
        },
        async aguardarBoot() {
            for (let index = 0; index < 20; index += 1) {
                await Promise.resolve();
            }
        },
        async parar() {
            await stop();
            workers.splice(workers.indexOf(stop), 1);
        },
    };
}

function registroPendente(
    agendamentoId: string,
    proximaTentativaEm = instanteBase,
    tentativas = 0,
): RegistroPendente {
    return { agendamentoId, tentativas, versao: 1, proximaTentativaEm };
}

function dependencies(
    current: typeof agendamento | null,
    syncFailure?: unknown,
) {
    const repository = {
        reivindicar: vi.fn(),
        buscarAgendamento: vi.fn().mockResolvedValue(current),
        finalizar: vi.fn().mockResolvedValue(true),
    };
    const adapter = {
        inserirOuReativar:
            syncFailure === undefined
                ? vi.fn().mockResolvedValue(undefined)
                : vi.fn().mockRejectedValue(syncFailure),
        excluir: vi.fn().mockResolvedValue(undefined),
    };
    return {
        repository,
        adapter,
        agora: () => base,
        logError: vi.fn(),
    };
}

describe('processarItemSincronizacao', () => {
    it.each([
        ['inexistente', null],
        ['cancelado', { ...agendamento, status: StatusAgendamento.CANCELADO }],
    ])('remove evento de agendamento %s', async (_label, current) => {
        const deps = dependencies(current as typeof agendamento | null);
        await processarItemSincronizacao(item, deps as never);

        expect(deps.adapter.excluir).toHaveBeenCalledOnce();
        expect(deps.adapter.inserirOuReativar).not.toHaveBeenCalled();
        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({ status: 'SINCRONIZADO', tentativas: 0 }),
        );
    });

    it('reagenda falha transitória com backoff exponencial', async () => {
        const deps = dependencies(
            agendamento,
            new GoogleCalendarApiError(503, true),
        );
        await processarItemSincronizacao(item, deps as never);

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({
                status: 'PENDENTE',
                tentativas: 1,
                proximaTentativaEm: new Date(base.getTime() + 30_000),
            }),
        );
        expect(deps.logError).not.toHaveBeenCalled();
    });

    it('marca falha permanente como ERRO sem logar dados pessoais', async () => {
        const deps = dependencies(
            agendamento,
            new GoogleCalendarApiError(400, false),
        );
        await processarItemSincronizacao(item, deps as never);

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({ status: 'ERRO', tentativas: 1 }),
        );
        expect(deps.logError).toHaveBeenCalledWith({
            agendamentoId: item.agendamentoId,
            erro: 'Google Calendar HTTP 400',
        });
        expect(JSON.stringify(deps.logError.mock.calls)).not.toContain(
            agendamento.cliente.telefone,
        );
    });

    it('marca ERRO ao atingir oito tentativas', async () => {
        const deps = dependencies(
            agendamento,
            new GoogleCalendarApiError(503, true),
        );
        await processarItemSincronizacao(
            { ...item, tentativas: 7 },
            deps as never,
        );

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({ status: 'ERRO', tentativas: 8 }),
        );
    });

    it('usa versão reivindicada no compare-and-set', async () => {
        const deps = dependencies(agendamento);
        deps.repository.finalizar.mockResolvedValue(false);
        await processarItemSincronizacao(item, deps as never);

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            3,
            expect.objectContaining({ status: 'SINCRONIZADO' }),
        );
    });
});

describe('scheduler do worker da outbox', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(instanteBase);
    });

    it('não consulta novamente com outbox vazia', async () => {
        const worker = criarWorker();
        await worker.aguardarBoot();

        expect(worker.repository.listarPendentes).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(10 * 60_000);

        expect(worker.repository.listarPendentes).toHaveBeenCalledOnce();
        expect(worker.repository.reivindicar).not.toHaveBeenCalled();
    });

    it('processa item novo após notificação de enqueue', async () => {
        const worker = criarWorker();
        await worker.aguardarBoot();
        worker.adicionar(registroPendente('novo'));

        await vi.advanceTimersByTimeAsync(0);

        expect(worker.repository.reivindicar).toHaveBeenCalledOnce();
        expect(worker.adapter.inserirOuReativar).toHaveBeenCalledOnce();
        expect(worker.registros).toHaveLength(0);
    });

    it('aguarda proximaTentativaEm antes de tentar novamente', async () => {
        const inserir = vi
            .fn()
            .mockRejectedValueOnce(new GoogleCalendarApiError(503, true))
            .mockResolvedValue(undefined);
        const worker = criarWorker([], 0, inserir);
        await worker.aguardarBoot();
        worker.adicionar(registroPendente('retry'));
        await vi.advanceTimersByTimeAsync(0);

        expect(inserir).toHaveBeenCalledOnce();
        expect(
            worker.repository.finalizar.mock.calls[0]?.[2].proximaTentativaEm,
        ).toEqual(new Date(instanteBase.getTime() + 30_000));
        await vi.advanceTimersByTimeAsync(29_999);
        expect(inserir).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(inserir).toHaveBeenCalledTimes(2);
    });

    it('processa filas acima de dez em lotes consecutivos', async () => {
        const itens = Array.from({ length: 11 }, (_, index) =>
            registroPendente(`lote-${index}`),
        );
        const worker = criarWorker(itens);
        await worker.aguardarBoot();

        await vi.advanceTimersByTimeAsync(0);

        expect(
            worker.repository.reivindicar.mock.calls.map((call) => call[1]),
        ).toEqual([10, 10]);
        expect(worker.adapter.inserirOuReativar).toHaveBeenCalledTimes(11);
        expect(worker.registros).toHaveLength(0);
    });

    it('limita retry quando claim vazio mantém item vencido', async () => {
        const worker = criarWorker([registroPendente('concorrente')]);
        await worker.aguardarBoot();
        worker.repository.reivindicar.mockResolvedValue([]);

        await vi.advanceTimersByTimeAsync(0);
        expect(worker.repository.reivindicar).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(29_999);
        expect(worker.repository.reivindicar).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1);
        expect(worker.repository.reivindicar).toHaveBeenCalledTimes(2);
    });

    it('reivindica item novamente quando lease de dois minutos vence', async () => {
        const worker = criarWorker([
            registroPendente(
                'lease',
                new Date(instanteBase.getTime() + 2 * 60_000),
            ),
        ]);
        await worker.aguardarBoot();

        await vi.advanceTimersByTimeAsync(2 * 60_000 - 1);
        expect(worker.repository.reivindicar).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        expect(worker.repository.reivindicar).toHaveBeenCalledOnce();
        expect(worker.adapter.inserirOuReativar).toHaveBeenCalledOnce();
    });

    it('recupera item pendente na varredura de boot após restart', async () => {
        const worker = criarWorker([registroPendente('restart')]);
        await worker.aguardarBoot();

        await vi.advanceTimersByTimeAsync(0);

        expect(worker.repository.listarPendentes).toHaveBeenCalledTimes(2);
        expect(worker.adapter.inserirOuReativar).toHaveBeenCalledOnce();
    });

    it('sweep detecta trabalho não notificado e registra contagem sem IDs', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const worker = criarWorker([], 60_000);
        await worker.aguardarBoot();
        worker.adicionar(registroPendente('nao-notificado'), false);

        await vi.advanceTimersByTimeAsync(60_000);
        await worker.aguardarBoot();
        await vi.advanceTimersByTimeAsync(1);
        await worker.aguardarBoot();

        expect(aviso).toHaveBeenCalledWith(
            '[GOOGLE CALENDAR] Varredura encontrou itens sem vencimento agendado.',
            { evento: 'outbox_sem_vencimento_agendado', quantidade: 1 },
        );
        expect(JSON.stringify(aviso.mock.calls)).not.toContain(
            'nao-notificado',
        );
        expect(worker.repository.listarPendentes).toHaveBeenCalledTimes(3);
        expect(worker.adapter.inserirOuReativar).toHaveBeenCalledOnce();
    });

    it('shutdown remove timer de vencimento, sweep e observador', async () => {
        const worker = criarWorker(
            [
                registroPendente(
                    'future',
                    new Date(instanteBase.getTime() + 5 * 60_000),
                ),
            ],
            60_000,
        );
        await worker.aguardarBoot();
        expect(vi.getTimerCount()).toBe(2);

        await worker.parar();
        worker.notificar({
            agendamentoId: 'after-stop',
            status: 'PENDENTE',
            proximaTentativaEm: instanteBase,
        });

        expect(vi.getTimerCount()).toBe(0);
    });

    it('valida intervalo da varredura de segurança', () => {
        expect(__testables.getSafetySweepMs()).toBe(60 * 60_000);
        vi.stubEnv('GOOGLE_CALENDAR_SAFETY_SWEEP_MS', '0');
        expect(__testables.getSafetySweepMs()).toBe(0);
        vi.stubEnv('GOOGLE_CALENDAR_SAFETY_SWEEP_MS', '60000');
        expect(__testables.getSafetySweepMs()).toBe(60_000);
        vi.stubEnv('GOOGLE_CALENDAR_SAFETY_SWEEP_MS', '59999');
        expect(() => __testables.getSafetySweepMs()).toThrow(
            'GOOGLE_CALENDAR_SAFETY_SWEEP_MS inválida',
        );
    });
});
