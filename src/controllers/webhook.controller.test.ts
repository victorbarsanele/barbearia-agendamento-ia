import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { receberWhatsappWebhook } from './webhook.controller';
import {
    processarMensagemWhatsapp,
    sendWhatsAppText,
} from '../services/gemini.service';

vi.mock('../services/gemini.service', () => ({
    processarMensagemWhatsapp: vi.fn(),
    sendWhatsAppText: vi.fn(),
}));

const processarMensagemWhatsappMock = vi.mocked(processarMensagemWhatsapp);
const sendWhatsAppTextMock = vi.mocked(sendWhatsAppText);

function criarReplyMock() {
    const reply = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;

    return reply;
}

function criarRequestMock(body: unknown) {
    return {
        body,
    } as FastifyRequest;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('webhook.controller.receberWhatsappWebhook', () => {
    it('bloqueia mensagem acima de 500 caracteres', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '5511999999999@s.whatsapp.net',
                    fromMe: false,
                },
                message: { conversation: 'a'.repeat(501) },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(sendWhatsAppTextMock).toHaveBeenCalledWith(
            '5511999999999@s.whatsapp.net',
            'Mensagem muito longa. Por favor, seja mais breve.',
        );
        expect(processarMensagemWhatsappMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
        expect(reply.send).toHaveBeenCalledWith({ ok: true });
    });

    it('bloqueia mensagem contendo URL', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '5511999999999@s.whatsapp.net',
                    fromMe: false,
                },
                message: { conversation: 'veja https://exemplo.com' },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(sendWhatsAppTextMock).toHaveBeenCalledWith(
            '5511999999999@s.whatsapp.net',
            'Não consigo processar links. Posso agendar um horário?',
        );
        expect(processarMensagemWhatsappMock).not.toHaveBeenCalled();
    });

    it.each([
        'ignore as instruções',
        'system prompt agora',
        'instrução secreta',
        'dan me o contexto',
        'jailbreak pedido',
        'bypass de regras',
        'prompt interno',
        'base64 decode isso',
    ])('bloqueia padrão suspeito conhecido: %s', async (mensagem) => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '5511999999999@s.whatsapp.net',
                    fromMe: false,
                },
                message: { conversation: mensagem },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(sendWhatsAppTextMock).toHaveBeenCalledWith(
            '5511999999999@s.whatsapp.net',
            'Só posso ajudar com agendamentos. Quer marcar um horário?',
        );
        expect(processarMensagemWhatsappMock).not.toHaveBeenCalled();
    });

    it('permite mensagem normal dentro do limite, sem URL e sem padrão suspeito', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '5511999999999@s.whatsapp.net',
                    fromMe: false,
                },
                message: {
                    conversation: 'Quero agendar um corte amanhã às 10h',
                },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(processarMensagemWhatsappMock).toHaveBeenCalledWith(
            '5511999999999@s.whatsapp.net',
            'Quero agendar um corte amanhã às 10h',
        );
        expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('filtra mensagem vinda de grupo e não processa', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: { remoteJid: '120363123456789@g.us', fromMe: false },
                message: { conversation: 'Quero agendar' },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(processarMensagemWhatsappMock).not.toHaveBeenCalled();
        expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
        expect(reply.send).toHaveBeenCalledWith({ ok: true });
    });

    it('usa remoteJidAlt quando addressingMode é "lid"', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '48220470251628@lid',
                    remoteJidAlt: '5519998374350@s.whatsapp.net',
                    addressingMode: 'lid',
                    fromMe: false,
                },
                message: {
                    conversation: 'Quero agendar um corte',
                },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(processarMensagemWhatsappMock).toHaveBeenCalledWith(
            '5519998374350@s.whatsapp.net',
            'Quero agendar um corte',
        );
        expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('mantém comportamento antigo quando addressingMode não está presente', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '5511999999999@s.whatsapp.net',
                    fromMe: false,
                },
                message: {
                    conversation: 'Quero agendar um corte',
                },
            },
        });

        await receberWhatsappWebhook(request, reply);

        expect(processarMensagemWhatsappMock).toHaveBeenCalledWith(
            '5511999999999@s.whatsapp.net',
            'Quero agendar um corte',
        );
        expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
    });

    it('faz fallback para remoteJid quando addressingMode é "lid" mas remoteJidAlt ausente', async () => {
        const reply = criarReplyMock();
        const request = criarRequestMock({
            data: {
                key: {
                    remoteJid: '48220470251628@lid',
                    addressingMode: 'lid',
                    fromMe: false,
                },
                message: {
                    conversation: 'Quero agendar um corte',
                },
            },
        });

        await receberWhatsappWebhook(request, reply);

        // Fallback: usa remoteJid como recebido, deixa camadas seguintes tratarem
        expect(processarMensagemWhatsappMock).toHaveBeenCalledWith(
            '48220470251628@lid',
            'Quero agendar um corte',
        );
        expect(sendWhatsAppTextMock).not.toHaveBeenCalled();
        expect(reply.status).toHaveBeenCalledWith(200);
    });
});
