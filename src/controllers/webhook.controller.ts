import { FastifyReply, FastifyRequest } from 'fastify';
import {
    processarMensagemWhatsapp,
    sendWhatsAppText,
} from '../services/gemini.service';

const MAX_MESSAGE_LENGTH = 500;
const URL_PATTERN = /(https?:\/\/|www\.)/i;
const JAILBREAK_PATTERN =
    /\b(ignore|system\s*prompt|instru[çc][aã]o|dan|jailbreak|bypass|prompt|base64)\b/i;

interface BlockDecision {
    blocked: boolean;
    reason?: string;
    response?: string;
}

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    return value as AnyRecord;
}

function readString(record: AnyRecord | null, key: string): string | null {
    if (!record) {
        return null;
    }

    const value = record[key];
    return typeof value === 'string' ? value : null;
}

function readBoolean(record: AnyRecord | null, key: string): boolean | null {
    if (!record) {
        return null;
    }

    const value = record[key];
    return typeof value === 'boolean' ? value : null;
}

function extractMessagePayload(body: unknown): {
    remoteJid: string | null;
    conversation: string | null;
    fromMe: boolean;
} {
    const root = asRecord(body);
    const data = asRecord(root?.data);

    const key = asRecord(data?.key ?? root?.key);
    const message = asRecord(data?.message ?? root?.message);

    const remoteJid = readString(key, 'remoteJid');
    const conversation = readString(message, 'conversation');
    const fromMe = readBoolean(key, 'fromMe') ?? false;

    return {
        remoteJid,
        conversation,
        fromMe,
    };
}

function evaluateIncomingMessage(message: string): BlockDecision {
    if (message.length > MAX_MESSAGE_LENGTH) {
        return {
            blocked: true,
            reason: 'mensagem muito longa',
            response: 'Mensagem muito longa. Por favor, seja mais breve.',
        };
    }

    if (URL_PATTERN.test(message)) {
        return {
            blocked: true,
            reason: 'mensagem com link',
            response: 'Não consigo processar links. Posso agendar um horário?',
        };
    }

    if (JAILBREAK_PATTERN.test(message)) {
        return {
            blocked: true,
            reason: 'padrão suspeito de jailbreak',
            response:
                'Só posso ajudar com agendamentos. Quer marcar um horário?',
        };
    }

    return { blocked: false };
}

export async function receberWhatsappWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const { remoteJid, conversation, fromMe } = extractMessagePayload(
        request.body,
    );

    if (remoteJid?.endsWith('@g.us')) {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (fromMe) {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (!remoteJid || !conversation) {
        void reply.status(200).send({ ok: true });
        return;
    }

    const blockDecision = evaluateIncomingMessage(conversation);

    if (blockDecision.blocked && blockDecision.response) {
        console.log(
            `[WEBHOOK] Mensagem bloqueada: ${blockDecision.reason} | numero: ${remoteJid}`,
        );

        await sendWhatsAppText(remoteJid, blockDecision.response);

        void reply.status(200).send({ ok: true });
        return;
    }

    await processarMensagemWhatsapp(remoteJid, conversation);

    void reply.status(200).send({ ok: true });
}
