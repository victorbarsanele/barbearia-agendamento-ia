import { FastifyReply, FastifyRequest } from 'fastify';
import { registrarMensagemProcessada } from '../services/processed-whatsapp-message.service';
import { processarMensagemRecebida } from '../services/whatsapp-incoming-message.service';
import { registrarRespostaHumanaIdempotente } from '../services/gemini.service';
import { avisarBarbeiroUsuarioSemTelefone } from '../services/ycloud-username-notification.service';
import { IncomingWhatsAppMessage } from '../whatsapp/types';
import { parseYCloudWebhookEvent } from '../whatsapp/ycloud-inbound.adapter';
import { verifyYCloudSignature } from '../whatsapp/ycloud-signature';
import { getWhatsAppProvider } from '../whatsapp/config';
import { getWhatsAppAllowlist } from '../whatsapp/allowlist';

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
            console.log(
                '[YCLOUD WEBHOOK] Eco ignorado pela lista de teste.',
            );
            void reply.status(200).send({ ok: true });
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

    if (
        !event.message.text ||
        (!event.message.phone && !event.message.alternateUserId)
    ) {
        if (
            !event.message.phone &&
            !event.message.alternateUserId
        ) {
            console.warn(
                '[YCLOUD WEBHOOK] Mensagem ignorada: remetente sem telefone e identificador alternativo.',
            );
        }
        void reply.status(200).send({ ok: true });
        return;
    }

    if (!event.message.messageId) {
        console.warn(
            '[YCLOUD WEBHOOK] ID da mensagem ausente; processamento sem deduplicação.',
        );
    } else {
        try {
            const isFirstDelivery = await registrarMensagemProcessada(
                event.message.provider,
                event.message.messageId,
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
    void processarEventoYCloud(event.message).catch(() => {
        console.error('[YCLOUD WEBHOOK] Falha no processamento assíncrono.');
    });
}
