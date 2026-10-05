import {
    escalarParaHumano,
    processarMensagemWhatsapp,
    sendWhatsAppText,
} from './gemini.service';
import { IncomingWhatsAppMessage } from '../whatsapp/types';

const MAX_MESSAGE_LENGTH = 500;
const URL_PATTERN = /(https?:\/\/|www\.)/i;
const JAILBREAK_PATTERN =
    /\b(ignore|system\s*prompt|instru[çc][aã]o|dan|jailbreak|bypass|prompt|base64)\b/i;
const ESCALATION_KEYWORDS_PATTERN =
    /\b(atendente|humano|pessoa real|falar com o barbeiro|falar com alguem)\b/i;

interface BlockDecision {
    blocked: boolean;
    reason?: string;
    response?: string;
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

function mascararTelefone(phone: string): string {
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export async function processarMensagemRecebida(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    const { phone, text } = message;

    if (!phone || !text) {
        return;
    }

    try {
        if (ESCALATION_KEYWORDS_PATTERN.test(text)) {
            console.log(
                `[WEBHOOK] Escalonamento por palavra-chave | numero: ${mascararTelefone(phone)}`,
            );
            await escalarParaHumano(phone, 'palavra_chave');
            return;
        }

        const blockDecision = evaluateIncomingMessage(text);

        if (blockDecision.blocked && blockDecision.response) {
            console.log(
                `[WEBHOOK] Mensagem bloqueada: ${blockDecision.reason} | numero: ${mascararTelefone(phone)}`,
            );
            await sendWhatsAppText(phone, blockDecision.response);
            return;
        }

        await processarMensagemWhatsapp(phone, text);
    } catch {
        console.error('[WEBHOOK] Falha no processamento assíncrono.');
    }
}
