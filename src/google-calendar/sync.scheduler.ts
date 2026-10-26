import type { GoogleCalendarAdapter } from './google-calendar.adapter';
import {
    ATRASO_RECONCILIACAO_INICIAL_MS,
    INTERVALO_RECONCILIACAO_MS,
    reconciliarGoogleAgenda,
} from './sync.service';

export function iniciarReconciliacaoGoogleAgenda(
    adapter: GoogleCalendarAdapter,
): () => Promise<void> {
    let timeoutInicial: NodeJS.Timeout | undefined;
    let intervalo: NodeJS.Timeout | undefined;
    let reconciliacaoEmAndamento: Promise<void> | undefined;

    const executar = (): Promise<void> => {
        if (reconciliacaoEmAndamento) return reconciliacaoEmAndamento;
        reconciliacaoEmAndamento = reconciliarGoogleAgenda(adapter)
            .then(
                () => undefined,
                () => {
                    console.error('[GOOGLE CALENDAR] Falha na reconciliação.');
                },
            )
            .finally(() => {
                reconciliacaoEmAndamento = undefined;
            });
        return reconciliacaoEmAndamento;
    };

    timeoutInicial = setTimeout(
        () => void executar(),
        ATRASO_RECONCILIACAO_INICIAL_MS,
    );
    timeoutInicial.unref();
    intervalo = setInterval(() => void executar(), INTERVALO_RECONCILIACAO_MS);
    intervalo.unref();

    return async () => {
        if (timeoutInicial) clearTimeout(timeoutInicial);
        if (intervalo) clearInterval(intervalo);
        timeoutInicial = undefined;
        intervalo = undefined;
        await reconciliacaoEmAndamento;
    };
}
