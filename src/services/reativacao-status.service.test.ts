import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    processarStatusReativacao,
    REATIVACAO_STATUS_RELEITURA_ATRASO_MS,
} from './reativacao-status.service';
import type { YCloudMessageStatusEvent } from '../whatsapp/ycloud-inbound.adapter';

function evento(
    status: string,
    overrides: Partial<YCloudMessageStatusEvent> = {},
): YCloudMessageStatusEvent {
    return {
        kind: 'status',
        id: 'ycloud-id-1',
        wamid: 'wamid-1',
        status,
        errorCode: null,
        errorMessage: null,
        ...overrides,
    };
}

function criarDependencias(resultado = true) {
    const atualizarStatusPorYCloudMessageId = vi
        .fn()
        .mockResolvedValue(resultado);
    return {
        repository: { atualizarStatusPorYCloudMessageId },
        atualizarStatusPorYCloudMessageId,
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('processarStatusReativacao', () => {
    it.each([
        ['sent', null],
        ['delivered', 'ENTREGUE'],
        ['read', 'ENTREGUE'],
        ['failed', 'FALHOU'],
    ])('mapeia status YCloud %s', async (status, esperado) => {
        const dependencias = criarDependencias();

        await processarStatusReativacao(evento(status), dependencias);

        if (esperado === null) {
            expect(
                dependencias.atualizarStatusPorYCloudMessageId,
            ).not.toHaveBeenCalled();
        } else {
            expect(
                dependencias.atualizarStatusPorYCloudMessageId,
            ).toHaveBeenCalledWith(
                'ycloud-id-1',
                esperado,
                status === 'failed' ? 'FALHA_YCLOUD' : null,
            );
        }
    });

    it('mantém motivo da falha com no máximo 200 caracteres', async () => {
        const dependencias = criarDependencias();
        const errorMessage = 'x'.repeat(250);

        await processarStatusReativacao(
            evento('failed', { errorCode: '131000', errorMessage }),
            dependencias,
        );

        expect(
            dependencias.atualizarStatusPorYCloudMessageId,
        ).toHaveBeenCalledWith(
            'ycloud-id-1',
            'FALHOU',
            `131000: ${errorMessage}`.slice(0, 200),
        );
    });

    it('ignora status desconhecido ou sem id', async () => {
        const dependencias = criarDependencias();

        await processarStatusReativacao(evento('accepted'), dependencias);
        await processarStatusReativacao(
            evento('failed', { id: null }),
            dependencias,
        );

        expect(
            dependencias.atualizarStatusPorYCloudMessageId,
        ).not.toHaveBeenCalled();
    });

    it('acknowledges unmatched non-failure without scheduling another read', async () => {
        const dependencias = criarDependencias(false);
        const agendar = vi.fn();

        await processarStatusReativacao(evento('delivered'), {
            ...dependencias,
            agendar,
        });

        expect(agendar).not.toHaveBeenCalled();
        expect(
            dependencias.atualizarStatusPorYCloudMessageId,
        ).toHaveBeenCalledTimes(1);
    });

    it('re-reads failed status once after delay, then ignores missing row', async () => {
        vi.useFakeTimers();
        const dependencias = criarDependencias(false);
        const agendar = vi.fn((callback: () => void, atrasoMs: number) => {
            setTimeout(callback, atrasoMs);
        });
        const processamento = processarStatusReativacao(evento('failed'), {
            ...dependencias,
            agendar,
        });
        await Promise.resolve();

        expect(
            dependencias.atualizarStatusPorYCloudMessageId,
        ).toHaveBeenCalledTimes(1);
        expect(agendar).toHaveBeenCalledWith(
            expect.any(Function),
            REATIVACAO_STATUS_RELEITURA_ATRASO_MS,
        );

        await vi.advanceTimersByTimeAsync(
            REATIVACAO_STATUS_RELEITURA_ATRASO_MS,
        );
        await expect(processamento).resolves.toBeUndefined();
        expect(
            dependencias.atualizarStatusPorYCloudMessageId,
        ).toHaveBeenCalledTimes(2);
    });

    it('propagates transient repository errors for HTTP 500 handling', async () => {
        const atualizarStatusPorYCloudMessageId = vi
            .fn()
            .mockRejectedValue(new Error('database unavailable'));

        await expect(
            processarStatusReativacao(evento('delivered'), {
                repository: { atualizarStatusPorYCloudMessageId },
            }),
        ).rejects.toThrow('database unavailable');
    });
});
