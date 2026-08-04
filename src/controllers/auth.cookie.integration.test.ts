import cookie from '@fastify/cookie';
import { hashSync } from 'bcryptjs';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetRevokedTokens, registerAuthPlugin } from '../plugins/auth.plugin';
import { authRoutes } from '../routes/auth.routes';

const TEST_USERNAME = 'admin';
const TEST_PASSWORD = 'Senha@123!';

let app: FastifyInstance | null = null;

function getSetCookieHeader(
    setCookieHeader: string | string[] | undefined,
): string {
    if (Array.isArray(setCookieHeader)) {
        const first = setCookieHeader[0];

        if (first) {
            return first;
        }
    }

    if (typeof setCookieHeader === 'string') {
        return setCookieHeader;
    }

    throw new Error('Cabecalho set-cookie ausente na resposta.');
}

function extractCookiePair(setCookieHeader: string): string {
    const cookiePair = setCookieHeader.split(';')[0];

    if (!cookiePair) {
        throw new Error('Cookie token ausente no cabecalho set-cookie.');
    }

    return cookiePair;
}

async function buildApp(cookieSecure: boolean): Promise<FastifyInstance> {
    process.env.COOKIE_SECURE = cookieSecure ? 'true' : 'false';

    const fastifyApp = Fastify();
    await fastifyApp.register(cookie);
    await fastifyApp.register(registerAuthPlugin);
    await fastifyApp.register(authRoutes);

    return fastifyApp;
}

async function loginAndGetCookie(fastifyApp: FastifyInstance): Promise<string> {
    const loginResponse = await fastifyApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
            username: TEST_USERNAME,
            password: TEST_PASSWORD,
        },
    });

    expect(loginResponse.statusCode).toBe(200);

    return extractCookiePair(
        getSetCookieHeader(loginResponse.headers['set-cookie']),
    );
}

beforeEach(() => {
    process.env.JWT_SECRET = 'jwt-secret-teste';
    process.env.ADMIN_USER = TEST_USERNAME;
    process.env.ADMIN_PASSWORD_HASH = hashSync(TEST_PASSWORD, 4);
    process.env.BARBER_USER = '';
    process.env.BARBER_PASSWORD_HASH = '';
    resetRevokedTokens();
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
});

describe('auth cookie integration', () => {
    it('login bem-sucedido seta cookie httpOnly com atributos corretos', async () => {
        app = await buildApp(true);

        const response = await app.inject({
            method: 'POST',
            url: '/auth/login',
            payload: {
                username: TEST_USERNAME,
                password: TEST_PASSWORD,
            },
        });

        expect(response.statusCode).toBe(200);

        const setCookie = getSetCookieHeader(response.headers['set-cookie']);
        expect(setCookie).toContain('token=');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('Secure');
        expect(setCookie).toContain('SameSite=None');
        expect(setCookie).toContain('Max-Age=28800');
    });

    it('rota protegida sem cookie retorna 401', async () => {
        app = await buildApp(false);

        const response = await app.inject({
            method: 'GET',
            url: '/auth/me',
        });

        expect(response.statusCode).toBe(401);
    });

    it('rota protegida com cookie valido retorna 200', async () => {
        app = await buildApp(false);
        const cookieHeader = await loginAndGetCookie(app);

        const response = await app.inject({
            method: 'GET',
            url: '/auth/me',
            headers: {
                cookie: cookieHeader,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            username: TEST_USERNAME,
            role: 'admin',
        });
    });

    it('logout limpa cookie e uso manual do cookie antigo falha', async () => {
        app = await buildApp(false);
        const cookieHeader = await loginAndGetCookie(app);

        const logoutResponse = await app.inject({
            method: 'POST',
            url: '/auth/logout',
            headers: {
                cookie: cookieHeader,
            },
        });

        expect(logoutResponse.statusCode).toBe(200);

        const logoutSetCookie = getSetCookieHeader(
            logoutResponse.headers['set-cookie'],
        );

        expect(logoutSetCookie).toContain('token=;');
        expect(logoutSetCookie).toContain('Path=/');

        const responseAfterLogout = await app.inject({
            method: 'GET',
            url: '/auth/me',
            headers: {
                cookie: cookieHeader,
            },
        });

        expect(responseAfterLogout.statusCode).toBe(401);
    });

    it('GET /auth/me retorna 401 quando nao autenticado', async () => {
        app = await buildApp(false);

        const response = await app.inject({
            method: 'GET',
            url: '/auth/me',
        });

        expect(response.statusCode).toBe(401);
    });
});
