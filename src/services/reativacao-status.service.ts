import {
    getReativacaoRepository,
    type ReativacaoRepository,
} from '../repositories/reativacao.repository';
import type { YCloudMessageStatusEvent } from '../whatsapp/ycloud-inbound.adapter';

export const REATIVACAO_STATUS_RELEITURA_ATRASO_MS = 3_000;

export interface DependenciasStatusReativacao {
    repository?: Pick<
        ReativacaoRepository,
        'atualizarStatusPorYCloudMessageId'
    >;
    agendar?: (callback: () => void, atrasoMs: number) => unknown;
    atrasoMs?: number;
}

function mapearStatus(status: string | null): 'ENTREGUE' | 'FALHOU' | null {
    if (status === 'delivered' || status === 'read') return 'ENTREGUE';
    if (status === 'failed') return 'FALHOU';
    return null;
}

function montarMotivoFalha(event: YCloudMessageStatusEvent): string {
    const partes = [event.errorCode, event.errorMessage].filter(
        (parte): parte is string => parte !== null && parte.length > 0,
    );
    return (partes.join(': ') || 'FALHA_YCLOUD').slice(0, 200);
}

export async function processarStatusReativacao(
    event: YCloudMessageStatusEvent,
    dependencias: DependenciasStatusReativacao = {},
): Promise<void> {
    const status = mapearStatus(event.status);
    if (!status || !event.id) return;

    const repository = dependencias.repository ?? getReativacaoRepository();
    const motivoFalha = status === 'FALHOU' ? montarMotivoFalha(event) : null;
    const correspondente = await repository.atualizarStatusPorYCloudMessageId(
        event.id,
        status,
        motivoFalha,
    );

    if (correspondente || status !== 'FALHOU') return;

    const agendar =
        dependencias.agendar ??
        ((callback: () => void, atrasoMs: number) =>
            setTimeout(callback, atrasoMs));
    const atrasoMs =
        dependencias.atrasoMs ?? REATIVACAO_STATUS_RELEITURA_ATRASO_MS;

    await new Promise<void>((resolve, reject) => {
        agendar(() => {
            void repository
                .atualizarStatusPorYCloudMessageId(
                    event.id!,
                    status,
                    motivoFalha,
                )
                .then(() => resolve(), reject);
        }, atrasoMs);
    });
}
