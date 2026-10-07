import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendYCloudTemplate, sendYCloudText } from './ycloud-outbound.adapter';
import { sendWhatsAppText } from './whatsapp-outbound.service';

const API_KEY = 'ycloud-api-key-test';

beforeEach(() => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
    vi.stubEnv('YCLOUD_API_KEY', API_KEY);
    vi.stubEnv('YCLOUD_FROM_NUMBER', '+5511888888888');
    vi.stubEnv('SIMULACAO_WEBHOOK', '');
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({}),
        }),
    );
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe('YCloud outbound adapter', () => {
    it('sends text to sendDirectly with API key and E.164 sender and recipient', async () => {
        await sendWhatsAppText('5511999999999@s.whatsapp.net', 'Olá');

        expect(fetch).toHaveBeenCalledWith(
            'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY,
                },
                body: JSON.stringify({
                    from: '+5511888888888',
                    to: '+5511999999999',
                    type: 'text',
                    text: { body: 'Olá', preview_url: false },
                }),
            }),
        );
    });

    it('sends template parameters in order and uses pt_BR', async () => {
        await sendYCloudTemplate('5511999999999', 'aviso_reagendamento', [
            { type: 'text', text: 'Ana' },
            { type: 'text', text: 'sexta-feira, 10/10 às 15:00' },
        ]);

        const [, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(JSON.parse(String(init?.body))).toEqual({
            from: '+5511888888888',
            to: '+5511999999999',
            type: 'template',
            template: {
                name: 'aviso_reagendamento',
                language: { code: 'pt_BR' },
                components: [
                    {
                        type: 'body',
                        parameters: [
                            { type: 'text', text: 'Ana' },
                            {
                                type: 'text',
                                text: 'sexta-feira, 10/10 às 15:00',
                            },
                        ],
                    },
                ],
            },
        });
    });

    it('rejects non-2xx without logging or including the request body', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                json: vi.fn().mockResolvedValue({
                    code: 'bad_request',
                    message: 'invalid parameter',
                }),
            }),
        );

        const failure = sendYCloudText('5511999999999', 'PRIVATE MESSAGE');
        await expect(failure).rejects.toThrow(
            /HTTP 400; código bad_request; mensagem invalid parameter/,
        );
        await failure.catch((error: Error) => {
            expect(error.message).not.toContain('PRIVATE MESSAGE');
        });
    });

    it('keeps invalid recipient and missing sender configuration errors out of network catch', async () => {
        await expect(sendYCloudText('invalid number', 'text')).rejects.toThrow(
            'Número de WhatsApp inválido.',
        );
        expect(fetch).not.toHaveBeenCalled();

        vi.stubEnv('YCLOUD_FROM_NUMBER', '');
        await expect(sendYCloudText('5511999999999', 'text')).rejects.toThrow(
            'YCLOUD_FROM_NUMBER não configurado.',
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it('throws on 2xx failed status and masks long digit sequences', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({
                    status: 'failed',
                    code: 'failure',
                    message: 'Rejected for +5511999999999',
                }),
            }),
        );

        await expect(
            sendYCloudText('5511999999999', 'PRIVATE MESSAGE'),
        ).rejects.toThrow(
            'Falha no envio YCloud: status failed; código failure; mensagem Rejected for [número].',
        );
    });

    it('accepts unreadable 2xx body and logs only safe response metadata', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockRejectedValue(new Error('unreadable')),
            }),
        );
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        await expect(
            sendYCloudText('5511999999999', 'PRIVATE MESSAGE'),
        ).resolves.toBeUndefined();

        expect(info).toHaveBeenCalledWith(
            '[YCLOUD] Envio aceito | id: ausente | status: ausente',
        );
        expect(JSON.stringify(info.mock.calls)).not.toContain('5511999999999');
        expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE MESSAGE');
        info.mockRestore();
    });

    it('logs accepted ID and status without recipient or message', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue({
                    id: 'outbound-id',
                    status: 'sent',
                }),
            }),
        );
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        await sendYCloudText('5511999999999', 'PRIVATE MESSAGE');

        expect(info).toHaveBeenCalledWith(
            '[YCLOUD] Envio aceito | id: outbound-id | status: sent',
        );
        expect(JSON.stringify(info.mock.calls)).not.toContain('5511999999999');
        expect(JSON.stringify(info.mock.calls)).not.toContain('PRIVATE MESSAGE');
        info.mockRestore();
    });

    it('aborts request after 15 seconds', async () => {
        vi.useFakeTimers();
        vi.stubGlobal(
            'fetch',
            vi.fn(
                (_url: string | URL | Request, init?: RequestInit) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener('abort', () =>
                            reject(new Error('aborted')),
                        );
                    }),
            ),
        );

        const pending = sendYCloudText('5511999999999', 'Olá');
        const rejected = expect(pending).rejects.toThrow(
            'Timeout no envio YCloud após 15000 ms.',
        );
        await vi.advanceTimersByTimeAsync(15_000);
        await rejected;
    });

    it('simulation mode does not call API or log message text', async () => {
        vi.stubEnv('SIMULACAO_WEBHOOK', 'true');
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});

        await sendWhatsAppText('5511999999999', 'PRIVATE MESSAGE');

        expect(fetch).not.toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE MESSAGE');
        expect(JSON.stringify(log.mock.calls)).toContain('9999');
        log.mockRestore();
    });
});
