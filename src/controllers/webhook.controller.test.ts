import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { receberWhatsappWebhook } from './webhook.controller';
import { registrarMensagemProcessada } from '../services/processed-whatsapp-message.service';
import { processarMensagemRecebida } from '../services/whatsapp-incoming-message.service';

vi.mock('../services/processed-whatsapp-message.service', () => ({
    registrarMensagemProcessada: vi.fn(),
}));

vi.mock('../services/whatsapp-incoming-message.service', () => ({
    processarMensagemRecebida: vi.fn(),
}));

const TEST_WEBHOOK_SECRET = vi.hoisted(() => {
    const secret = 'webhook-secret-teste';
    vi.stubEnv('WEBHOOK_SECRET', secret);
    return secret;
});

const registrarMensagemProcessadaMock = vi.mocked(registrarMensagemProcessada);
const processarMensagemRecebidaMock = vi.mocked(processarMensagemRecebida);

function criarReplyMock() {
    const reply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    return reply;
}

function criarRequestMock(
    body: unknown,
    secret = TEST_WEBHOOK_SECRET,
) {
    return {
        body,
        headers: {
            'x-webhook-secret': secret,
        },
    } as unknown as FastifyRequest;
}

function criarPayload(overrides: {
    id?: string;
    remoteJid?: string;
    remoteJidAlt?: string;
    addressingMode?: string;
    fromMe?: boolean;
    text?: string;
} = {}) {
    const key: Record<string, unknown> = {
        remoteJid: overrides.remoteJid ?? '5511999999999@s.whatsapp.net',
        fromMe: overrides.fromMe ?? false,
    };

    if (overrides.id !== undefined) key.id = overrides.id;
    if (overrides.remoteJidAlt !== undefined) {
        key.remoteJidAlt = overrides.remoteJidAlt;
    }
    if (overrides.addressingMode !== undefined) {
        key.addressingMode = overrides.addressingMode;
    }

    return {
        data: {
            key,
            message: { conversation: overrides.text ?? 'Olá' },
        },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    registrarMensagemProcessadaMock.mockResolvedValue(true);
    processarMensagemRecebidaMock.mockResolvedValue();
});

describe('webhook.controller.receberWhatsappWebhook', () => {
    it('mantém autenticação por x-webhook-secret e não registra se falhar', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock(criarPayload({ id: 'message-1' }), '');

        await receberWhatsappWebhook(request, reply);

        expect(reply.status).toHaveBeenCalledWith(401);
        expect(registrarMensagemProcessadaMock).not.toHaveBeenCalled();
        expect(processarMensagemRecebidaMock).not.toHaveBeenCalled();
    });

    it('encerra duplicata com 200 sem iniciar processamento', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock(criarPayload({ id: 'message-1' }));
        registrarMensagemProcessadaMock.mockResolvedValue(false);

        await receberWhatsappWebhook(request, reply);

        expect(registrarMensagemProcessadaMock).toHaveBeenCalledWith(
            'evolution',
            'message-1',
        );
        expect(processarMensagemRecebidaMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
        expect(reply.send).toHaveBeenCalledWith({ ok: true });
    });

    it('registra e inicia processamento uma vez, após enviar resposta HTTP', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock(
            criarPayload({ id: 'message-1', text: 'Quero agendar' }),
        );
        const ordem: string[] = [];
        let finalizarProcessamento!: () => void;
        processarMensagemRecebidaMock.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    ordem.push('processamento');
                    finalizarProcessamento = resolve;
                }),
        );
        vi.mocked(reply.send).mockImplementation(() => {
            ordem.push('resposta');
            return reply;
        });

        await receberWhatsappWebhook(request, reply);

        expect(ordem).toEqual(['resposta', 'processamento']);
        expect(processarMensagemRecebidaMock).toHaveBeenCalledTimes(1);
        expect(processarMensagemRecebidaMock).toHaveBeenCalledWith({
            provider: 'evolution',
            messageId: 'message-1',
            phone: '5511999999999',
            alternateUserId: null,
            text: 'Quero agendar',
            isGroup: false,
            isFromMe: false,
        });
        finalizarProcessamento();
    });

    it('processa sem registrar quando ID está ausente e avisa sem dados pessoais', async () => {
        const reply = criarReplyMock();
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const request = criarRequestMock(criarPayload({ text: 'Olá' }));

        await receberWhatsappWebhook(request, reply);

        expect(registrarMensagemProcessadaMock).not.toHaveBeenCalled();
        expect(processarMensagemRecebidaMock).toHaveBeenCalledTimes(1);
        expect(warning).toHaveBeenCalledWith(
            '[WEBHOOK] ID da mensagem ausente; processamento sem deduplicação.',
        );
        expect(reply.status).toHaveBeenCalledWith(200);
        warning.mockRestore();
    });

    it('responde 500 se registro falhar e não processa', async () => {
        const reply = criarReplyMock();
        const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
        const request = criarRequestMock(criarPayload({ id: 'message-1' }));
        registrarMensagemProcessadaMock.mockRejectedValue(
            new Error('database unavailable'),
        );

        await receberWhatsappWebhook(request, reply);

        expect(reply.status).toHaveBeenCalledWith(500);
        expect(processarMensagemRecebidaMock).not.toHaveBeenCalled();
        expect(errorLog).toHaveBeenCalledWith(
            '[WEBHOOK] Falha ao registrar ID da mensagem processada.',
        );
        errorLog.mockRestore();
    });

    it.each([
        criarPayload({
            id: 'group-1',
            remoteJid: '120363123456789@g.us',
        }),
        criarPayload({ id: 'self-1', fromMe: true }),
        criarPayload({ id: 'empty-1', text: '' }),
    ])('ignora grupo, eco próprio ou texto vazio antes do registro', async (body) => {
        const reply = criarReplyMock();
        const request = criarRequestMock(body);

        await receberWhatsappWebhook(request, reply);

        expect(registrarMensagemProcessadaMock).not.toHaveBeenCalled();
        expect(processarMensagemRecebidaMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
    });
});
