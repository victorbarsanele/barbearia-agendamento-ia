import {
    escalarParaHumano,
    obterEstadoEscalonamento,
    processarMensagemWhatsapp,
    sendWhatsAppText,
} from './gemini.service';
import { EstadoEscalonamento } from '@prisma/client';
import { IncomingWhatsAppMessage } from '../whatsapp/types';
import { getEscalationStateRepository } from '../repositories/escalation-state.repository';

const MAX_MESSAGE_LENGTH = 500;
const URL_PATTERN = /(https?:\/\/|www\.)/i;
const JAILBREAK_PATTERN =
    /\b(ignore|system\s*prompt|instru[çc][aã]o|dan|jailbreak|bypass|prompt|base64)\b/i;
const ESCALATION_KEYWORDS_PATTERN =
    /\b(atendente|humano|pessoa real|falar com o barbeiro|falar com alguem)\b/i;
const MEDIA_NOTICE =
    'Olá! No momento só consigo entender mensagens escritas. Pode me enviar sua dúvida por texto?';
const DEFAULT_MEDIA_NOTICE_COOLDOWN_MS = 10 * 60 * 1000;

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

function getMediaNoticeCooldownMs(): number {
    const configured = Number(
        process.env.MEDIA_NOTICE_COOLDOWN_MS ??
            DEFAULT_MEDIA_NOTICE_COOLDOWN_MS,
    );
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_MEDIA_NOTICE_COOLDOWN_MS;
}

export async function processarMensagemRecebida(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    const { phone, text } = message;

    if (
        !phone ||
        message.kind === 'unknown' ||
        (message.kind === 'text' && !text)
    ) {
        return;
    }

    try {
        const estado = await obterEstadoEscalonamento(phone);
        if (message.kind === 'non_text') {
            const estadoAtual = estado?.estado ?? EstadoEscalonamento.BOT;
            if (estadoAtual !== EstadoEscalonamento.BOT) {
                console.info('[WEBHOOK] Mídia não textual suprimida', {
                    provider: message.provider,
                    kind: message.kind,
                    rawType: message.rawType,
                    estado: estadoAtual,
                    aviso: 'estado',
                    telefone: mascararTelefone(phone),
                });
                return;
            }

            const claim =
                await getEscalationStateRepository().reivindicarAvisoMidia(
                    phone,
                    new Date(),
                    getMediaNoticeCooldownMs(),
                );
            if (!claim.reivindicado) {
                console.info('[WEBHOOK] Mídia não textual suprimida', {
                    provider: message.provider,
                    kind: message.kind,
                    rawType: message.rawType,
                    estado: estadoAtual,
                    aviso: 'cooldown',
                    telefone: mascararTelefone(phone),
                });
                return;
            }

            try {
                await sendWhatsAppText(phone, MEDIA_NOTICE);
                console.info('[WEBHOOK] Aviso de mídia não textual enviado', {
                    provider: message.provider,
                    kind: message.kind,
                    rawType: message.rawType,
                    estado: estadoAtual,
                    aviso: 'enviado',
                    telefone: mascararTelefone(phone),
                });
            } catch (error) {
                try {
                    await getEscalationStateRepository().liberarAvisoMidia(
                        phone,
                        claim.reivindicadoEm,
                    );
                } catch {
                    console.error(
                        '[WEBHOOK] Falha ao liberar cooldown do aviso de mídia não textual.',
                    );
                }
                console.error(
                    '[WEBHOOK] Falha ao enviar aviso de mídia não textual.',
                    error,
                );
            }
            return;
        }

        if (!text) {
            return;
        }

        if (
            estado?.estado === EstadoEscalonamento.ESCALADO ||
            estado?.estado === EstadoEscalonamento.HUMANO_ATIVO
        ) {
            console.debug(
                `[WEBHOOK] Mensagem ignorada durante escalonamento | numero: ${mascararTelefone(phone)}`,
            );
            return;
        }

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
