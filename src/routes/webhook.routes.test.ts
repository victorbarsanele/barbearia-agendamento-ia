import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { webhookRoutes } from './webhook.routes';

const controllerMocks = vi.hoisted(() => ({
    evolution: vi.fn(
        async (_request: FastifyRequest, reply: FastifyReply) =>
            reply.send({ ok: true }),
    ),
    ycloud: vi.fn(
        async (request: FastifyRequest, reply: FastifyReply) =>
            reply.send({ body: request.body }),
    ),
}));

vi.mock('../controllers/webhook.controller', () => ({
    receberWhatsappWebhook: controllerMocks.evolution,
}));
vi.mock('../controllers/ycloud-webhook.controller', () => ({
    receberYCloudWebhook: controllerMocks.ycloud,
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('webhook routes content parsing', () => {
    it('preserves raw JSON body only for YCloud route', async () => {
        const app = Fastify();
        await app.register(webhookRoutes);
        const rawBody = '{ "type": "test", "text": "spaced" }';

        const ycloudResponse = await app.inject({
            method: 'POST',
            url: '/webhook/ycloud',
            headers: { 'content-type': 'application/json' },
            payload: rawBody,
        });
        expect(ycloudResponse.json()).toEqual({ body: rawBody });

        const evolutionResponse = await app.inject({
            method: 'POST',
            url: '/webhook/whatsapp',
            headers: { 'content-type': 'application/json' },
            payload: rawBody,
        });
        expect(evolutionResponse.json()).toEqual({ ok: true });
        expect(controllerMocks.evolution).toHaveBeenCalledWith(
            expect.objectContaining({ body: { type: 'test', text: 'spaced' } }),
            expect.anything(),
        );
        await app.close();
    });
});
