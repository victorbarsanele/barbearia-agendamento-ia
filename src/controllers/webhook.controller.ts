import { FastifyReply, FastifyRequest } from 'fastify';
import { registrarMensagemProcessada } from '../services/processed-whatsapp-message.service';
import { processarMensagemRecebida } from '../services/whatsapp-incoming-message.service';
import { parseEvolutionIncomingMessage } from '../whatsapp/evolution-inbound.adapter';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

export async function receberWhatsappWebhook(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<void> {
    if (
        !WEBHOOK_SECRET ||
        request.headers['x-webhook-secret'] !== WEBHOOK_SECRET
    ) {
        console.log('[WEBHOOK] Requisição bloqueada por autenticação');
        void reply.status(401).send({ ok: false });
        return;
    }

    const message = parseEvolutionIncomingMessage(request.body);

    if (message.isGroup) {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (message.isFromMe) {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (!message.phone || !message.text) {
        void reply.status(200).send({ ok: true });
        return;
    }

    if (!message.messageId) {
        console.warn(
            '[WEBHOOK] ID da mensagem ausente; processamento sem deduplicação.',
        );
    } else {
        let isFirstDelivery: boolean;
        try {
            isFirstDelivery = await registrarMensagemProcessada(
                message.provider,
                message.messageId,
            );
        } catch {
            console.error(
                '[WEBHOOK] Falha ao registrar ID da mensagem processada.',
            );
            void reply.status(500).send({ ok: false });
            return;
        }

        if (!isFirstDelivery) {
            void reply.status(200).send({ ok: true });
            return;
        }
    }

    void reply.status(200).send({ ok: true });
    void processarMensagemRecebida(message).catch(() => {
        console.error('[WEBHOOK] Falha inesperada no processamento assíncrono.');
    });
}
