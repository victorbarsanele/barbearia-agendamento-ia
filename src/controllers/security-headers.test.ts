import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { hashSync } from 'bcryptjs';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerAuthPlugin, resetRevokedTokens } from '../plugins/auth.plugin';
import { authRoutes } from '../routes/auth.routes';

const TEST_USERNAME = 'admin';
const VALID_PASSWORD = 'Senha@123!';
const INVALID_PASSWORD = 'senha-invalida';

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
    const fastifyApp = Fastify();

    await fastifyApp.register(cookie);
    await fastifyApp.register(cors, {
        origin: ['http://localhost:5173'],
        credentials: true,
    });
    await fastifyApp.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
    });
    await fastifyApp.register(helmet);
    await fastifyApp.register(registerAuthPlugin);
    await fastifyApp.register(authRoutes);

    fastifyApp.get('/health', async () => ({ status: 'ok' }));

    return fastifyApp;
}

beforeEach(() => {
    process.env.JWT_SECRET = 'jwt-secret-teste';
    process.env.ADMIN_USER = TEST_USERNAME;
    process.env.ADMIN_PASSWORD_HASH = hashSync(VALID_PASSWORD, 4);
    process.env.BARBER_USER = '';
    process.env.BARBER_PASSWORD_HASH = '';
    process.env.COOKIE_SECURE = 'false';
    resetRevokedTokens();
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
});

describe('security headers e rate limit', () => {
    it('6a tentativa de POST /auth/login em menos de 15 minutos retorna 429', async () => {
        app = await buildApp();

        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    username: TEST_USERNAME,
                    password: INVALID_PASSWORD,
                },
            });

            expect(response.statusCode).toBe(401);
        }

        const sixthResponse = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
                username: TEST_USERNAME,
                password: INVALID_PASSWORD,
            },
        });

        expect(sixthResponse.statusCode).toBe(429);
    });

    it('primeiras 5 tentativas de login com erro nao sao bloqueadas por rate limit', async () => {
        app = await buildApp();

        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const response = await app.inject({
                method: 'POST',
                url: '/auth/login',
                payload: {
                    username: TEST_USERNAME,
                    password: INVALID_PASSWORD,
                },
            });

            expect(response.statusCode).toBe(401);
        }
    });

    it('resposta inclui X-Frame-Options ou CSP com frame-ancestors', async () => {
        app = await buildApp();

        const response = await app.inject({
            method: 'GET',
            url: '/health',
        });

        const frameOptions = response.headers['x-frame-options'];
        const csp = response.headers['content-security-policy'];
        const hasFrameAncestors =
            typeof csp === 'string' && csp.includes('frame-ancestors');

        expect(Boolean(frameOptions) || hasFrameAncestors).toBe(true);
    });

    it('rota /health continua respondendo normalmente', async () => {
        app = await buildApp();

        const response = await app.inject({
            method: 'GET',
            url: '/health',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
    });
});
