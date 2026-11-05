import { FastifyReply, FastifyRequest } from 'fastify';
import { registrarMensagemProcessada } from '../services/processed-whatsapp-message.service';
import { processarMensagemRecebida } from '../services/whatsapp-incoming-message.service';
import {
    buscarClientePorTelefoneVariantes,
    registrarRespostaHumanaIdempotente,
    sendWhatsAppText,
} from '../services/gemini.service';
import { avisarBarbeiroUsuarioSemTelefone } from '../services/ycloud-username-notification.service';
import { IncomingWhatsAppMessage } from '../whatsapp/types';
import { parseYCloudWebhookEvent } from '../whatsapp/ycloud-inbound.adapter';
import { verifyYCloudSignature } from '../whatsapp/ycloud-signature';
import { getWhatsAppProvider } from '../whatsapp/config';
import { getWhatsAppAllowlist } from '../whatsapp/allowlist';
import { numeroEstaIgnorado } from '../services/numero-ignorado-whatsapp.service';
import { getReativacaoRepository } from '../repositories/reativacao.repository';
import {
    REATIVACAO_TEXTO_CONFIRMACAO_OPTOUT,
    REATIVACAO_TEXTO_SINTETICO,
} from '../whatsapp/ycloud-reativacao';

function mascararTelefone(phone: string): string {
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export async function processarEventoYCloud(
    message: IncomingWhatsAppMessage,
): Promise<void> {
    if (message.phone) {
        await processarMensagemRecebida(message);
        return;
    }

    if (message.alternateUserId) {
        await avisarBarbeiroUsuarioSemTelefone(message.alternateUserId);
        return;
    }

    console.warn(
        '[YCLOUD WEBHOOK] Mensagem ignorada: remetente sem telefone e identificador alternativo.',
    );
}

export async function receberYCloudWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    const rawBody = typeof request.body === 'string' ? request.body : undefined;
    const signature = request.headers['ycloud-signature'];
    const secret = process.env.YCLOUD_WEBHOOK_SECRET;

    if (
        !rawBody ||
        typeof signature !== 'string' ||
        !verifyYCloudSignature(rawBody, signature, secret)
    ) {
        void reply.status(401).send({ ok: false });
        return;
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody) as unknown;
    } catch {
        void reply.status(400).send({ ok: false });
        return;
    }

    const event = parseYCloudWebhookEvent(body);
    if (event.kind === 'echo') {
        console.info('[YCLOUD WEBHOOK] Estrutura de eco recebida', {
            ...event.structure,
            messageIdPresent: event.messageId !== null,
            status: event.structure.status,
            type: event.structure.messageType,
        });

        if (getWhatsAppProvider() !== 'ycloud') {
            void reply.status(200).send({ ok: true });
            return;
        }

        if (!event.phone) {
            console.warn(
                '[YCLOUD WEBHOOK] Eco sem destinatário telefone; takeover ignorado.',
            );
            void reply.status(200).send({ ok: true });
            return;
        }

        const allowlist = getWhatsAppAllowlist();
        if (allowlist.active && !allowlist.phones.has(event.phone)) {
            console.log('[YCLOUD WEBHOOK] Eco ignorado pela lista de teste.');
            void reply.status(200).send({ ok: true });
            return;
        }

        try {
            if (await numeroEstaIgnorado(event.phone)) {
                console.info('[WHATSAPP] Mensagem ignorada', {
                    provider: 'ycloud',
                    origem: 'eco',
                    motivo: 'numero_na_lista_ignorada',
                    telefone: mascararTelefone(event.phone),
                });
                void reply.status(200).send({ ok: true });
                return;
            }
        } catch {
            console.error('[WHATSAPP] Falha ao consultar lista ignorada', {
                provider: 'ycloud',
                origem: 'eco',
                motivo: 'falha_consulta_banco',
            });
            void reply.status(500).send({ ok: false });
            return;
        }

        if (!event.messageId) {
            console.warn(
                '[YCLOUD WEBHOOK] Eco sem ID; takeover ignorado sem deduplicação.',
            );
            void reply.status(200).send({ ok: true });
            return;
        }

        try {
            const processado = await registrarRespostaHumanaIdempotente(
                event.phone,
                event.messageId,
                event.sendTime,
            );
            if (!processado) {
                console.debug(
                    `[YCLOUD WEBHOOK] Eco duplicado ignorado | numero: ${mascararTelefone(event.phone)}`,
                );
                void reply.status(200).send({ ok: true });
                return;
            }
        } catch {
            console.error(
                `[YCLOUD WEBHOOK] Falha ao registrar takeover do eco | numero: ${mascararTelefone(event.phone)}`,
            );
            void reply.status(500).send({ ok: false });
            return;
        }
        void reply.status(200).send({ ok: true });
        return;
    }

    if (event.kind === 'ignored') {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (getWhatsAppProvider() !== 'ycloud') {
        console.log(
            '[YCLOUD WEBHOOK] Mensagem recebida ignorada: provedor ativo não é ycloud',
        );
        void reply.status(200).send({ ok: true });
        return;
    }

    const allowlist = getWhatsAppAllowlist();
    if (
        allowlist.active &&
        (!event.message.phone || !allowlist.phones.has(event.message.phone))
    ) {
        console.log('[YCLOUD WEBHOOK] Mensagem ignorada pela lista de teste');
        void reply.status(200).send({ ok: true });
        return;
    }

    let message = event.message;
    if (!message.phone && !message.alternateUserId) {
        console.warn(
            '[YCLOUD WEBHOOK] Mensagem ignorada: remetente sem telefone e identificador alternativo.',
        );
        void reply.status(200).send({ ok: true });
        return;
    }

    if (message.phone) {
        try {
            if (await numeroEstaIgnorado(message.phone)) {
                console.info('[WHATSAPP] Mensagem ignorada', {
                    provider: 'ycloud',
                    origem: 'inbound',
                    motivo: 'numero_na_lista_ignorada',
                    telefone: mascararTelefone(message.phone),
                });
                void reply.status(200).send({ ok: true });
                return;
            }
        } catch {
            console.error('[WHATSAPP] Falha ao consultar lista ignorada', {
                provider: 'ycloud',
                origem: 'inbound',
                motivo: 'falha_consulta_banco',
            });
            void reply.status(500).send({ ok: false });
            return;
        }
    }

    const reativacaoAction =
        message.kind === 'button_reply'
            ? (message.buttonReply?.action ?? null)
            : null;

    if (message.kind === 'button_reply' && !message.phone) {
        console.warn(
            '[YCLOUD WEBHOOK] Quick reply ignorado: telefone do remetente ausente.',
        );
        void reply.status(200).send({ ok: true });
        return;
    }

    if (message.kind === 'unknown') {
        if (message.rawType) {
            console.info('[YCLOUD WEBHOOK] Tipo de mensagem ignorado', {
                provider: message.provider,
                rawType: message.rawType,
                ...(message.rawSubtype
                    ? { rawSubtype: message.rawSubtype }
                    : {}),
                motivo: 'tipo_ignorado',
            });
        }
        void reply.status(200).send({ ok: true });
        return;
    }

    if (reativacaoAction === 'optout') {
        const optOutPhone = message.phone;
        if (!optOutPhone) {
            void reply.status(200).send({ ok: true });
            return;
        }
        try {
            const cliente = await buscarClientePorTelefoneVariantes(optOutPhone);
            if (cliente) {
                await getReativacaoRepository().registrarOptOutMarketing(
                    cliente.id,
                    new Date(),
                );
            } else {
                console.warn(
                    '[YCLOUD WEBHOOK] Opt-out recebido para telefone sem cliente cadastrado.',
                    { telefone: mascararTelefone(optOutPhone) },
                );
            }
        } catch {
            console.error(
                '[YCLOUD WEBHOOK] Falha ao registrar opt-out de marketing.',
                { telefone: mascararTelefone(optOutPhone) },
            );
            void reply.status(500).send({ ok: false });
            return;
        }
    } else if (reativacaoAction === 'agendar') {
        message = {
            ...message,
            kind: 'text',
            text: REATIVACAO_TEXTO_SINTETICO,
            buttonReply: null,
        };
    }

    if (
        reativacaoAction === null &&
        message.kind !== 'non_text' &&
        !message.text
    ) {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (!message.messageId) {
        if (reativacaoAction === 'optout') {
            console.warn(
                '[YCLOUD WEBHOOK] Opt-out sem ID; confirmação ignorada sem deduplicação.',
            );
            void reply.status(200).send({ ok: true });
            return;
        }
        console.warn(
            '[YCLOUD WEBHOOK] ID da mensagem ausente; processamento sem deduplicação.',
        );
    } else {
        try {
            const isFirstDelivery = await registrarMensagemProcessada(
                message.provider,
                message.messageId,
            );
            if (!isFirstDelivery) {
                void reply.status(200).send({ ok: true });
                return;
            }
        } catch {
            console.error(
                '[YCLOUD WEBHOOK] Falha ao registrar ID da mensagem processada.',
            );
            void reply.status(500).send({ ok: false });
            return;
        }
    }

    void reply.status(200).send({ ok: true });
    if (reativacaoAction === 'optout') {
        void sendWhatsAppText(
            message.phone!,
            REATIVACAO_TEXTO_CONFIRMACAO_OPTOUT,
        ).catch(() => {
            console.error(
                '[YCLOUD WEBHOOK] Falha ao enviar confirmação de opt-out.',
                { telefone: mascararTelefone(message.phone!) },
            );
        });
        return;
    }

    void processarEventoYCloud(message).catch(() => {
        console.error('[YCLOUD WEBHOOK] Falha no processamento assíncrono.');
    });
}
