import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import {
    notificarAutoConclusao,
    observarAutoConclusao,
    type SnapshotAutoConclusao,
} from '../lib/auto-conclusao-events';

const mocks = vi.hoisted(() => ({
    listarParaConclusaoAutomatica: vi.fn(),
    concluirAutomaticamente: vi.fn(),
    enfileirarSincronizacao: vi.fn(),
}));

vi.mock('../repositories/agendamento.repository', () => ({
    listarParaConclusaoAutomatica: mocks.listarParaConclusaoAutomatica,
}));
vi.mock('./agendamento.service', () => ({
    concluirAutomaticamente: mocks.concluirAutomaticamente,
}));
vi.mock('../google-calendar/sync.service', () => ({
    enfileirarSincronizacao: mocks.enfileirarSincronizacao,
}));

import {
    iniciarJobAutoConclusao,
    processarCicloAutoConclusao,
} from './auto-conclusao-agendamento.service';

const workers: (() => void)[] = [];
const horaLocalBase = new Date('2026-11-08T08:59:00.000Z');

function snapshot(
    id: string,
    dataHoraFim = new Date('2026-11-08T01:00:00.000Z'),
): SnapshotAutoConclusao {
    return {
        id,
        pacoteClienteId: `pc-${id}`,
        servicoId: `s-${id}`,
        status: StatusAgendamento.AGENDADO,
        concluido: false,
        dataHoraInicio: new Date('2026-11-07T20:00:00.000Z'),
        dataHoraFim,
        statusPacoteCliente: StatusPacoteCliente.ATIVO,
    };
}

async function flushPromises(): Promise<void> {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

function iniciarScheduler(rows: SnapshotAutoConclusao[], safetySweepMs = 0) {
    const listarPendentes = vi.fn(async () => rows.map((row) => ({ ...row })));
    const observar = vi.fn(observarAutoConclusao);
    const stop = iniciarJobAutoConclusao({
        listarPendentes,
        observar,
        agora: () => new Date(Date.now()),
        safetySweepMs,
    });
    workers.push(stop);
    return { listarPendentes, observar, stop };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'true');
    vi.stubEnv('AUTO_CONCLUSAO_A_PARTIR_DE', '2026-11-01');
    vi.stubEnv('AUTO_CONCLUSAO_HORA_LOCAL', '6');
    mocks.listarParaConclusaoAutomatica.mockResolvedValue([]);
    mocks.enfileirarSincronizacao.mockResolvedValue(undefined);
});

afterEach(() => {
    workers.splice(0).forEach((stop) => stop());
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('processarCicloAutoConclusao', () => {
    it('não instala intervalo quando feature está desligada', () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');
        const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

        iniciarJobAutoConclusao();

        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('não consulta candidatos quando feature está desligada', async () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');

        await processarCicloAutoConclusao();

        expect(mocks.listarParaConclusaoAutomatica).not.toHaveBeenCalled();
    });

    it('pula saldo esgotado, conclui outros e isola falhas', async () => {
        const candidatos = [
            { id: 'feito', pacoteClienteId: 'pc-1', servicoId: 's-1' },
            { id: 'sem-saldo', pacoteClienteId: 'pc-2', servicoId: 's-2' },
            { id: 'ignorado', pacoteClienteId: 'pc-3', servicoId: 's-3' },
            { id: 'falha', pacoteClienteId: 'pc-4', servicoId: 's-4' },
        ];
        mocks.listarParaConclusaoAutomatica.mockResolvedValue(candidatos);
        mocks.concluirAutomaticamente
            .mockResolvedValueOnce({ estado: 'CONCLUIDO' })
            .mockResolvedValueOnce({ estado: 'SALDO_ESGOTADO' })
            .mockResolvedValueOnce({ estado: 'IGNORADO' })
            .mockRejectedValueOnce(new Error('falha de teste'));
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await processarCicloAutoConclusao(new Date('2026-11-08T12:00:00.000Z'));

        expect(mocks.enfileirarSincronizacao).toHaveBeenCalledOnce();
        expect(mocks.enfileirarSincronizacao).toHaveBeenCalledWith(['feito']);
        expect(info).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({
                concluidos: 1,
                ignorados: 1,
                falhas: 1,
                pendenciasSaldoEsgotado: 1,
            }),
        );
    });

    it('não derruba ciclo quando enqueue Google falha', async () => {
        mocks.listarParaConclusaoAutomatica.mockResolvedValue([
            { id: 'feito', pacoteClienteId: 'pc-1', servicoId: 's-1' },
        ]);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'CONCLUIDO',
        });
        mocks.enfileirarSincronizacao.mockRejectedValueOnce(
            new Error('Google indisponível'),
        );
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            processarCicloAutoConclusao(new Date('2026-11-08T12:00:00.000Z')),
        ).resolves.toBeUndefined();
        expect(info).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({ concluidos: 1, falhasSincronizacao: 1 }),
        );
    });

    it('avisa uma vez por agendamento e mantém pendência em cada ciclo', async () => {
        const candidato = {
            id: 'saldo-aviso-unico',
            pacoteClienteId: 'pc-1',
            servicoId: 's-1',
        };
        mocks.listarParaConclusaoAutomatica.mockResolvedValue([candidato]);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'SALDO_ESGOTADO',
        });
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        await processarCicloAutoConclusao(new Date('2026-11-08T12:00:00.000Z'));
        await processarCicloAutoConclusao(new Date('2026-11-08T12:15:00.000Z'));

        expect(aviso).toHaveBeenCalledOnce();
        expect(aviso).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Saldo esgotado.',
            expect.objectContaining({ agendamentoId: candidato.id }),
        );
        expect(info).toHaveBeenNthCalledWith(
            1,
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({ pendenciasSaldoEsgotado: 1 }),
        );
        expect(info).toHaveBeenNthCalledWith(
            2,
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({ pendenciasSaldoEsgotado: 1 }),
        );
    });
});

describe('scheduler orientado a vencimento', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(horaLocalBase);
    });

    it('não consulta novamente por dez minutos quando não há pendências', async () => {
        const worker = iniciarScheduler([]);
        await flushPromises();

        expect(worker.listarPendentes).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(10 * 60_000);

        expect(worker.listarPendentes).toHaveBeenCalledOnce();
        expect(mocks.concluirAutomaticamente).not.toHaveBeenCalled();
    });

    it('encadeia timer distante sem consultar antes do vencimento', async () => {
        const worker = iniciarScheduler([
            snapshot('distante', new Date('2027-01-01T12:00:00.000Z')),
        ]);
        await flushPromises();

        await vi.advanceTimersByTimeAsync(2_147_483_647);

        expect(worker.listarPendentes).toHaveBeenCalledOnce();
        expect(mocks.concluirAutomaticamente).not.toHaveBeenCalled();
    });

    it('acorda por criação e conclui exatamente no vencimento', async () => {
        const item = snapshot('criado');
        const rows: SnapshotAutoConclusao[] = [];
        const worker = iniciarScheduler(rows);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'CONCLUIDO',
        });
        await flushPromises();

        rows.push(item);
        notificarAutoConclusao({ tipo: 'agendamento', agendamento: item });
        await vi.advanceTimersByTimeAsync(59_999);
        expect(mocks.concluirAutomaticamente).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        expect(mocks.concluirAutomaticamente).toHaveBeenCalledOnce();
        expect(mocks.concluirAutomaticamente).toHaveBeenCalledWith(
            {
                id: item.id,
                pacoteClienteId: item.pacoteClienteId,
                servicoId: item.servicoId,
            },
            expect.any(Date),
            expect.any(Date),
            expect.any(Date),
        );
    });

    it('remarcação para depois substitui o timer antigo', async () => {
        let item = snapshot('remarcado');
        const rows = [item];
        const worker = iniciarScheduler(rows);
        await flushPromises();

        item = {
            ...item,
            dataHoraFim: new Date('2026-11-09T01:00:00.000Z'),
        };
        rows[0] = item;
        notificarAutoConclusao({ tipo: 'agendamento', agendamento: item });
        await vi.advanceTimersByTimeAsync(60 * 60_000);

        expect(mocks.concluirAutomaticamente).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);

        expect(mocks.concluirAutomaticamente).toHaveBeenCalledOnce();
    });

    it('remarcação para antes antecipa o timer', async () => {
        let item = snapshot('antecipado', new Date('2026-11-09T01:00:00.000Z'));
        const rows = [item];
        const worker = iniciarScheduler(rows);
        await flushPromises();
        item = snapshot('antecipado');
        rows[0] = item;
        notificarAutoConclusao({ tipo: 'agendamento', agendamento: item });
        await vi.advanceTimersByTimeAsync(60_000);

        expect(mocks.concluirAutomaticamente).toHaveBeenCalledOnce();
    });

    it('cancelamento antes do vencimento remove o timer do agendamento', async () => {
        const item = snapshot('cancelado');
        const proximo = snapshot(
            'proximo',
            new Date('2026-11-09T01:00:00.000Z'),
        );
        const rows = [item, proximo];
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'CONCLUIDO',
        });
        iniciarScheduler(rows);
        await flushPromises();
        rows.splice(0, 1);
        notificarAutoConclusao({
            tipo: 'agendamento',
            agendamento: { ...item, status: StatusAgendamento.CANCELADO },
        });
        await vi.advanceTimersByTimeAsync(60_000);

        expect(mocks.concluirAutomaticamente).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);

        expect(mocks.concluirAutomaticamente).toHaveBeenCalledOnce();
        expect(mocks.concluirAutomaticamente.mock.calls[0]?.[0].id).toBe(
            proximo.id,
        );
    });

    it('processa vencimentos simultâneos sequencialmente sem query loop', async () => {
        const rows = [snapshot('primeiro'), snapshot('segundo')];
        const worker = iniciarScheduler(rows);
        mocks.concluirAutomaticamente.mockImplementation(async () => ({
            estado: 'CONCLUIDO',
        }));
        await flushPromises();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(mocks.concluirAutomaticamente).toHaveBeenCalledTimes(2);
        expect(worker.listarPendentes).toHaveBeenCalledTimes(2);
    });

    it('boot conclui agendamento já vencido', async () => {
        vi.setSystemTime(new Date('2026-11-08T09:00:00.000Z'));
        iniciarScheduler([snapshot('restart')]);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'CONCLUIDO',
        });
        await flushPromises();

        expect(mocks.concluirAutomaticamente).toHaveBeenCalledOnce();
    });

    it('safety sweep recupera item sem evento e loga somente contagem', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const rows: SnapshotAutoConclusao[] = [];
        const worker = iniciarScheduler(rows, 60_000);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'CONCLUIDO',
        });
        await flushPromises();
        rows.push(snapshot('sem-evento'));
        await vi.advanceTimersByTimeAsync(60_000);

        expect(aviso).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Varredura encontrou vencimentos não agendados.',
            {
                evento: 'auto_conclusao_sem_vencimento_agendado',
                quantidade: 1,
            },
        );
        expect(JSON.stringify(aviso.mock.calls)).not.toContain('sem-evento');
        expect(mocks.concluirAutomaticamente).toHaveBeenCalledOnce();
        expect(worker.listarPendentes).toHaveBeenCalledTimes(2);
    });

    it('flag false não consulta, não observa e não arma timers', async () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');
        const listarPendentes = vi.fn().mockResolvedValue([]);
        const observar = vi.fn(observarAutoConclusao);
        const stop = iniciarJobAutoConclusao({ listarPendentes, observar });
        workers.push(stop);

        await flushPromises();

        expect(listarPendentes).not.toHaveBeenCalled();
        expect(observar).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('shutdown limpa timers e desinscreve o observador', async () => {
        const item = snapshot('future', new Date('2026-11-10T01:00:00.000Z'));
        const worker = iniciarScheduler([item], 60_000);
        await flushPromises();
        expect(vi.getTimerCount()).toBe(2);

        worker.stop();
        notificarAutoConclusao({
            tipo: 'agendamento',
            agendamento: snapshot('after-stop'),
        });

        expect(vi.getTimerCount()).toBe(0);
        expect(worker.listarPendentes).toHaveBeenCalledOnce();
    });
});
