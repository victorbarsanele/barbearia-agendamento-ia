import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleCalendarAdapter } from './google-calendar.adapter';
import {
    ATRASOS_RETRY_RECONCILIACAO_MS,
    ATRASO_RECONCILIACAO_INICIAL_MS,
    INTERVALO_RECONCILIACAO_MS,
    iniciarReconciliacaoGoogleAgenda,
    MAX_TENTATIVAS_RETRY_RECONCILIACAO,
} from './sync.scheduler';

const adapter = {} as GoogleCalendarAdapter;

afterEach(() => vi.useRealTimers());

describe('scheduler de reconciliação', () => {
    it('reagenda falhas em 5, 15 e 30 min, depois volta a 6 h', async () => {
        vi.useFakeTimers();
        const reconciliar = vi.fn().mockResolvedValue({ sucesso: false });
        const parar = iniciarReconciliacaoGoogleAgenda(adapter, reconciliar);

        await vi.advanceTimersByTimeAsync(ATRASO_RECONCILIACAO_INICIAL_MS);
        expect(reconciliar).toHaveBeenCalledTimes(1);

        for (const [
            indice,
            atraso,
        ] of ATRASOS_RETRY_RECONCILIACAO_MS.entries()) {
            await vi.advanceTimersByTimeAsync(atraso);
            expect(reconciliar).toHaveBeenCalledTimes(indice + 2);
        }

        await vi.advanceTimersByTimeAsync(INTERVALO_RECONCILIACAO_MS - 1);
        expect(reconciliar).toHaveBeenCalledTimes(
            MAX_TENTATIVAS_RETRY_RECONCILIACAO + 1,
        );
        await vi.advanceTimersByTimeAsync(1);
        expect(reconciliar).toHaveBeenCalledTimes(
            MAX_TENTATIVAS_RETRY_RECONCILIACAO + 2,
        );
        await vi.advanceTimersByTimeAsync(
            ATRASOS_RETRY_RECONCILIACAO_MS[0] - 1,
        );
        expect(reconciliar).toHaveBeenCalledTimes(
            MAX_TENTATIVAS_RETRY_RECONCILIACAO + 2,
        );
        await vi.advanceTimersByTimeAsync(1);
        expect(reconciliar).toHaveBeenCalledTimes(
            MAX_TENTATIVAS_RETRY_RECONCILIACAO + 3,
        );
        await parar();
    });

    it('sucesso zera contador para próxima sequência de falhas', async () => {
        vi.useFakeTimers();
        const reconciliar = vi
            .fn()
            .mockResolvedValueOnce({ sucesso: false })
            .mockResolvedValueOnce({ sucesso: true })
            .mockResolvedValueOnce({ sucesso: false });
        const parar = iniciarReconciliacaoGoogleAgenda(adapter, reconciliar);

        await vi.advanceTimersByTimeAsync(ATRASO_RECONCILIACAO_INICIAL_MS);
        await vi.advanceTimersByTimeAsync(ATRASOS_RETRY_RECONCILIACAO_MS[0]);
        await vi.advanceTimersByTimeAsync(INTERVALO_RECONCILIACAO_MS);
        await vi.advanceTimersByTimeAsync(
            ATRASOS_RETRY_RECONCILIACAO_MS[0] - 1,
        );
        expect(reconciliar).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1);
        expect(reconciliar).toHaveBeenCalledTimes(4);
        await parar();
    });

    it('não sobrepõe execuções e close aguarda execução ativa', async () => {
        vi.useFakeTimers();
        let resolver!: (resultado: { sucesso: boolean }) => void;
        const reconciliar = vi.fn(
            () =>
                new Promise<{ sucesso: boolean }>((resolve) => {
                    resolver = resolve;
                }),
        );
        const parar = iniciarReconciliacaoGoogleAgenda(adapter, reconciliar);

        await vi.advanceTimersByTimeAsync(ATRASO_RECONCILIACAO_INICIAL_MS);
        await vi.advanceTimersByTimeAsync(INTERVALO_RECONCILIACAO_MS * 2);
        expect(reconciliar).toHaveBeenCalledOnce();

        let closeConcluido = false;
        const fechar = parar().then(() => {
            closeConcluido = true;
        });
        await Promise.resolve();
        expect(closeConcluido).toBe(false);
        resolver({ sucesso: true });
        await fechar;
        expect(closeConcluido).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('close limpa timer ainda não disparado', async () => {
        vi.useFakeTimers();
        const reconciliar = vi.fn();
        const parar = iniciarReconciliacaoGoogleAgenda(adapter, reconciliar);

        await parar();

        expect(vi.getTimerCount()).toBe(0);
        expect(reconciliar).not.toHaveBeenCalled();
    });
});
