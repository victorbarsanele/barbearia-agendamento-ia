import { FastifyInstance } from 'fastify';
import * as webhookController from '../controllers/webhook.controller';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
    app.post(
        '/webhook/whatsapp',
        {
            schema: {
                body: {
                    type: 'object',
                    additionalProperties: true,
                },
            },
        },
        webhookController.receberWhatsappWebhook,
    );
}
