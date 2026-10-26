import type { GoogleCalendarAdapter } from './google-calendar.adapter';
import {
    ATRASO_RECONCILIACAO_INICIAL_MS,
    INTERVALO_RECONCILIACAO_MS,
    reconciliarGoogleAgenda,
    type ResultadoReconciliação,
} from './sync.service';

export const ATRASOS_RETRY_RECONCILIACAO_MS = [
    5 * 60 * 1000,
    15 * 60 * 1000,
    30 * 60 * 1000,
] as const;
export const MAX_TENTATIVAS_RETRY_RECONCILIACAO = 3;
export { ATRASO_RECONCILIACAO_INICIAL_MS, INTERVALO_RECONCILIACAO_MS };

type ExecutarReconciliação = (
    adapter: GoogleCalendarAdapter,
) => Promise<Pick<ResultadoReconciliação, 'sucesso'>>;

export function iniciarReconciliacaoGoogleAgenda(
    adapter: GoogleCalendarAdapter,
    reconciliar: ExecutarReconciliação = reconciliarGoogleAgenda,
): () => Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    let reconciliacaoEmAndamento: Promise<void> | undefined;
    let tentativasRetry = 0;
    let encerrando = false;

    const programar = (atrasoMs: number): void => {
        if (encerrando) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            void executar();
        }, atrasoMs);
        timer.unref();
    };

    const executar = (): Promise<void> => {
        if (encerrando) return Promise.resolve();
        if (reconciliacaoEmAndamento) return reconciliacaoEmAndamento;

        reconciliacaoEmAndamento = (async () => {
            let sucesso = false;
            try {
                sucesso = (await reconciliar(adapter)).sucesso;
            } catch {}

            if (sucesso) {
                tentativasRetry = 0;
                programar(INTERVALO_RECONCILIACAO_MS);
                return;
            }

            console.error('[GOOGLE CALENDAR] Falha na reconciliação.');
            if (tentativasRetry < MAX_TENTATIVAS_RETRY_RECONCILIACAO) {
                programar(ATRASOS_RETRY_RECONCILIACAO_MS[tentativasRetry]);
                tentativasRetry += 1;
                return;
            }

            tentativasRetry = 0;
            programar(INTERVALO_RECONCILIACAO_MS);
        })().finally(() => {
            reconciliacaoEmAndamento = undefined;
        });
        return reconciliacaoEmAndamento;
    };

    programar(ATRASO_RECONCILIACAO_INICIAL_MS);

    return async () => {
        encerrando = true;
        if (timer) clearTimeout(timer);
        timer = undefined;
        await reconciliacaoEmAndamento;
    };
}
