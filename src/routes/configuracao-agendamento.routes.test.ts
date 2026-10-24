import cookie from '@fastify/cookie';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRevokedTokens, registerAuthPlugin } from '../plugins/auth.plugin';
import { configuracaoAgendamentoRoutes } from './configuracao-agendamento.routes';

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
    const fastifyApp = Fastify();
    await fastifyApp.register(cookie);
    await fastifyApp.register(registerAuthPlugin);
    await fastifyApp.register(configuracaoAgendamentoRoutes);
    await fastifyApp.ready();
    return fastifyApp;
}

function getAuthCookie(fastifyApp: FastifyInstance): string {
    const token = fastifyApp.jwt.sign({ username: 'admin', role: 'admin' });
    return `token=${token}`;
}

beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'jwt-secret-teste');
    vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', undefined);
    resetRevokedTokens();
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
    vi.unstubAllEnvs();
});

describe('GET /configuracao-agendamento', () => {
    it('retorna valor padrão e somente a propriedade pública', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'GET',
            url: '/configuracao-agendamento',
            headers: { cookie: getAuthCookie(app) },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ minAntecedenciaMinutos: 60 });
        expect(Object.keys(response.json())).toEqual([
            'minAntecedenciaMinutos',
        ]);
    });

    it('lê valor atualizado do ambiente em cada requisição', async () => {
        app = await buildApp();
        const cookieHeader = getAuthCookie(app);

        const primeiraResposta = await app.inject({
            method: 'GET',
            url: '/configuracao-agendamento',
            headers: { cookie: cookieHeader },
        });
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');
        const segundaResposta = await app.inject({
            method: 'GET',
            url: '/configuracao-agendamento',
            headers: { cookie: cookieHeader },
        });

        expect(primeiraResposta.json()).toEqual({
            minAntecedenciaMinutos: 60,
        });
        expect(segundaResposta.statusCode).toBe(200);
        expect(segundaResposta.json()).toEqual({
            minAntecedenciaMinutos: 15,
        });
    });

    it('exige autenticação', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'GET',
            url: '/configuracao-agendamento',
        });

        expect(response.statusCode).toBe(401);
    });
});
