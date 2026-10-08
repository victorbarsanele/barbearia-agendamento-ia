import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { registrarMensagemProcessada } from '../services/processed-whatsapp-message.service';
import { processarMensagemRecebida } from '../services/whatsapp-incoming-message.service';
import { avisarBarbeiroUsuarioSemTelefone } from '../services/ycloud-username-notification.service';
import { receberYCloudWebhook } from './ycloud-webhook.controller';
import { createYCloudSignature } from '../whatsapp/ycloud-signature';

vi.mock('../services/processed-whatsapp-message.service', () => ({
    registrarMensagemProcessada: vi.fn(),
}));
vi.mock('../services/whatsapp-incoming-message.service', () => ({
    processarMensagemRecebida: vi.fn(),
}));
vi.mock('../services/ycloud-username-notification.service', () => ({
    avisarBarbeiroUsuarioSemTelefone: vi.fn(),
}));

const registerMock = vi.mocked(registrarMensagemProcessada);
const processMock = vi.mocked(processarMensagemRecebida);
const usernameMock = vi.mocked(avisarBarbeiroUsuarioSemTelefone);
const webhookSecret = 'ycloud-test-secret';

function makeReply() {
    return {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
}

function makeRequest(body: unknown, signature?: string | null) {
    const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
    return {
        body: rawBody,
        headers: {
            ...(signature === null
                ? {}
                : {
                      'ycloud-signature':
                          signature ?? createYCloudSignature(rawBody, webhookSecret),
                  }),
        },
    } as unknown as FastifyRequest;
}

function inboundBody(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
        type: 'whatsapp.inbound_message.received',
        whatsappInboundMessage: {
            wamid: 'wamid-1',
            from: '+5511999999999',
            type: 'text',
            text: { body: 'Olá' },
            ...overrides,
        },
    });
}

beforeEach(() => {
    vi.stubEnv('YCLOUD_WEBHOOK_SECRET', webhookSecret);
    vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
    vi.stubEnv('WHATSAPP_ALLOWLIST', '');
    vi.clearAllMocks();
    registerMock.mockResolvedValue(true);
    processMock.mockResolvedValue();
    usernameMock.mockResolvedValue();
});

describe('YCloud webhook controller', () => {
    it('retorna 401 para assinatura ausente, malformada, inválida, expirada ou segredo ausente', async () => {
        const absentHeader = makeReply();
        await receberYCloudWebhook(makeRequest(inboundBody(), null), absentHeader);
        expect(absentHeader.status).toHaveBeenCalledWith(401);

        const malformedHeader = makeReply();
        await receberYCloudWebhook(
            makeRequest(inboundBody(), 'malformed'),
            malformedHeader,
        );
        expect(malformedHeader.status).toHaveBeenCalledWith(401);

        const invalidHeader = makeReply();
        const validRawBody = inboundBody();
        await receberYCloudWebhook(
            makeRequest(validRawBody, createYCloudSignature('different body', webhookSecret)),
            invalidHeader,
        );
        expect(invalidHeader.status).toHaveBeenCalledWith(401);

        const expiredHeader = makeReply();
        await receberYCloudWebhook(
            makeRequest(
                inboundBody(),
                createYCloudSignature(
                    inboundBody(),
                    webhookSecret,
                    Math.floor(Date.now() / 1000) - 301,
                ),
            ),
            expiredHeader,
        );
        expect(expiredHeader.status).toHaveBeenCalledWith(401);

        const missingSecret = makeReply();
        vi.stubEnv('YCLOUD_WEBHOOK_SECRET', '');
        await receberYCloudWebhook(makeRequest(inboundBody()), missingSecret);
        expect(missingSecret.status).toHaveBeenCalledWith(401);
        expect(registerMock).not.toHaveBeenCalled();
    });

    it('processes repeated wamid once and ACKs duplicate', async () => {
        const reply = makeReply();
        const duplicateReply = makeReply();
        registerMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        await receberYCloudWebhook(makeRequest(inboundBody()), reply);
        await receberYCloudWebhook(makeRequest(inboundBody()), duplicateReply);

        expect(registerMock).toHaveBeenCalledWith('ycloud', 'wamid-1');
        expect(reply.status).toHaveBeenCalledWith(200);
        expect(duplicateReply.status).toHaveBeenCalledWith(200);
        expect(processMock).toHaveBeenCalledTimes(1);
    });

    it('ignores inbound messages while Evolution is active', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'evolution');
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const reply = makeReply();

        await receberYCloudWebhook(makeRequest(inboundBody()), reply);

        expect(reply.status).toHaveBeenCalledWith(200);
        expect(registerMock).not.toHaveBeenCalled();
        expect(processMock).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            '[YCLOUD WEBHOOK] Mensagem recebida ignorada: provedor ativo não é ycloud',
        );
        log.mockRestore();
    });

    it('accepts the inbound message when YCloud is active', async () => {
        const reply = makeReply();

        await receberYCloudWebhook(makeRequest(inboundBody()), reply);

        expect(reply.status).toHaveBeenCalledWith(200);
        expect(registerMock).toHaveBeenCalledWith('ycloud', 'wamid-1');
        expect(processMock).toHaveBeenCalledTimes(1);
    });

    it('ACKs before processing promise finishes', async () => {
        const reply = makeReply();
        const order: string[] = [];
        let finish!: () => void;
        vi.mocked(reply.send).mockImplementation(() => {
            order.push('ack');
            return reply;
        });
        processMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    order.push('processing');
                    finish = resolve;
                }),
        );

        await receberYCloudWebhook(makeRequest(inboundBody()), reply);

        expect(order).toEqual(['ack', 'processing']);
        finish();
    });

    it('returns 200 for unknown events and echoes without database processing', async () => {
        const unknownReply = makeReply();
        await receberYCloudWebhook(
            makeRequest(JSON.stringify({ type: 'whatsapp.message.updated' })),
            unknownReply,
        );
        expect(unknownReply.status).toHaveBeenCalledWith(200);
        expect(registerMock).not.toHaveBeenCalled();

        const echoReply = makeReply();
        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.smb.message.echoes',
                    whatsappSMBMessage: { wamid: 'echo-1' },
                }),
            ),
            echoReply,
        );
        expect(echoReply.status).toHaveBeenCalledWith(200);
        expect(registerMock).not.toHaveBeenCalled();
    });

    it('logs and acknowledges echo even when Evolution is active', async () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'evolution');
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const reply = makeReply();

        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.smb.message.echoes',
                    whatsappSMBMessage: { wamid: 'echo-2' },
                }),
            ),
            reply,
        );

        expect(reply.status).toHaveBeenCalledWith(200);
        expect(registerMock).not.toHaveBeenCalled();
        expect(processMock).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            '[YCLOUD WEBHOOK] Eco recebido | tipo: whatsapp.smb.message.echoes | wamid: echo-2',
        );
        log.mockRestore();
    });

    it('does not run Gemini for username-only sender', async () => {
        const reply = makeReply();
        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.inbound_message.received',
                    whatsappInboundMessage: {
                        wamid: 'wamid-username',
                        fromUserId: 'username-123',
                        type: 'text',
                        text: { body: 'Olá' },
                    },
                }),
            ),
            reply,
        );

        expect(usernameMock).toHaveBeenCalledWith('username-123');
        expect(processMock).not.toHaveBeenCalled();
    });

    it('allows listed phone and ignores unlisted phone before idempotency', async () => {
        vi.stubEnv(
            'WHATSAPP_ALLOWLIST',
            '+55 (11) 99999-9999, 5511888888888',
        );
        const listedReply = makeReply();
        await receberYCloudWebhook(makeRequest(inboundBody()), listedReply);

        expect(registerMock).toHaveBeenCalledWith('ycloud', 'wamid-1');
        expect(processMock).toHaveBeenCalledTimes(1);

        vi.clearAllMocks();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const unlistedReply = makeReply();
        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.inbound_message.received',
                    whatsappInboundMessage: {
                        wamid: 'unlisted-id',
                        from: '5511777777777',
                        type: 'text',
                        text: { body: 'Olá' },
                    },
                }),
            ),
            unlistedReply,
        );

        expect(unlistedReply.status).toHaveBeenCalledWith(200);
        expect(registerMock).not.toHaveBeenCalled();
        expect(processMock).not.toHaveBeenCalled();
        expect(usernameMock).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            '[YCLOUD WEBHOOK] Mensagem ignorada pela lista de teste',
        );
        log.mockRestore();
    });

    it('canonicalizes legacy mobile allowlist entry and ignores username-only sender', async () => {
        vi.stubEnv('WHATSAPP_ALLOWLIST', '551198765432');
        const listedReply = makeReply();
        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.inbound_message.received',
                    whatsappInboundMessage: {
                        wamid: 'legacy-mobile',
                        from: '5511998765432',
                        type: 'text',
                        text: { body: 'Olá' },
                    },
                }),
            ),
            listedReply,
        );
        expect(registerMock).toHaveBeenCalledWith('ycloud', 'legacy-mobile');
        expect(processMock).toHaveBeenCalledTimes(1);

        vi.clearAllMocks();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const usernameReply = makeReply();
        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.inbound_message.received',
                    whatsappInboundMessage: {
                        wamid: 'username-id',
                        fromUserId: 'username-private',
                        type: 'text',
                        text: { body: 'Olá' },
                    },
                }),
            ),
            usernameReply,
        );

        expect(usernameReply.status).toHaveBeenCalledWith(200);
        expect(registerMock).not.toHaveBeenCalled();
        expect(usernameMock).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith(
            '[YCLOUD WEBHOOK] Mensagem ignorada pela lista de teste',
        );
        log.mockRestore();
    });

    it('keeps username handling when allowlist is disabled', async () => {
        vi.stubEnv('WHATSAPP_ALLOWLIST', '  ');

        await receberYCloudWebhook(
            makeRequest(
                JSON.stringify({
                    type: 'whatsapp.inbound_message.received',
                    whatsappInboundMessage: {
                        wamid: 'username-id',
                        fromUserId: 'username-123',
                        type: 'text',
                        text: { body: 'Olá' },
                    },
                }),
            ),
            makeReply(),
        );

        expect(registerMock).toHaveBeenCalledWith('ycloud', 'username-id');
        expect(usernameMock).toHaveBeenCalledWith('username-123');
    });

    it('returns 500 and skips processing when idempotency registration fails', async () => {
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const reply = makeReply();
        registerMock.mockRejectedValue(new Error('database error'));

        await receberYCloudWebhook(makeRequest(inboundBody()), reply);

        expect(reply.status).toHaveBeenCalledWith(500);
        expect(processMock).not.toHaveBeenCalled();
        expect(errorLog).toHaveBeenCalledWith(
            '[YCLOUD WEBHOOK] Falha ao registrar ID da mensagem processada.',
        );
        errorLog.mockRestore();
    });
});
