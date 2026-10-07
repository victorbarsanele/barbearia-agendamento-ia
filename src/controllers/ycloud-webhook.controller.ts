import { FastifyReply, FastifyRequest } from 'fastify';
import { registrarMensagemProcessada } from '../services/processed-whatsapp-message.service';
import { processarMensagemRecebida } from '../services/whatsapp-incoming-message.service';
import { avisarBarbeiroUsuarioSemTelefone } from '../services/ycloud-username-notification.service';
import { IncomingWhatsAppMessage } from '../whatsapp/types';
import { parseYCloudWebhookEvent } from '../whatsapp/ycloud-inbound.adapter';
import { verifyYCloudSignature } from '../whatsapp/ycloud-signature';

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
        console.log(
            `[YCLOUD WEBHOOK] Eco recebido | tipo: whatsapp.smb.message.echoes | wamid: ${event.messageId ?? 'ausente'}`,
        );
        void reply.status(200).send({ ok: true });
        return;
    }

    if (
        event.kind === 'ignored' ||
        !event.message.text ||
        (!event.message.phone && !event.message.alternateUserId)
    ) {
        if (
            event.kind === 'message' &&
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
