import { FastifyInstance } from 'fastify';
import * as webhookController from '../controllers/webhook.controller';
import { receberYCloudWebhook } from '../controllers/ycloud-webhook.controller';

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

    await app.register(async (ycloudApp) => {
        ycloudApp.addContentTypeParser(
            'application/json',
            { parseAs: 'string' },
            (_request, body, done) => done(null, body),
        );
        ycloudApp.post('/webhook/ycloud', receberYCloudWebhook);
    });
}
