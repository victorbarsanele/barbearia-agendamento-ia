import cookie from '@fastify/cookie';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configuracaoAgendaMocks = vi.hoisted(() => ({
    obter: vi.fn(),
    definir: vi.fn(),
}));

vi.mock('../repositories/configuracaoAgenda.repository', () => ({
    obter: configuracaoAgendaMocks.obter,
    definir: configuracaoAgendaMocks.definir,
}));

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
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.stubEnv('JWT_SECRET', 'jwt-secret-teste');
    vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', undefined);
    vi.setSystemTime(new Date('2026-10-29T15:00:00.000Z'));
    configuracaoAgendaMocks.obter.mockReset();
    configuracaoAgendaMocks.definir.mockReset();
    configuracaoAgendaMocks.obter.mockResolvedValue({
        horizonteDias: null,
        limiteAte: null,
    });
    configuracaoAgendaMocks.definir.mockImplementation(
        async (configuracao) => configuracao,
    );
    resetRevokedTokens();
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
    vi.unstubAllEnvs();
    vi.useRealTimers();
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
        expect(response.json()).toEqual({
            minAntecedenciaMinutos: 60,
            horizonteDias: null,
            limiteAte: null,
            horizontePadraoDias: 20,
            horizonteEfetivo: '2026-11-18',
            limiteAtivo: false,
        });
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
            horizonteDias: null,
            limiteAte: null,
            horizontePadraoDias: 20,
            horizonteEfetivo: '2026-11-18',
            limiteAtivo: false,
        });
        expect(segundaResposta.statusCode).toBe(200);
        expect(segundaResposta.json()).toEqual({
            minAntecedenciaMinutos: 15,
            horizonteDias: null,
            limiteAte: null,
            horizontePadraoDias: 20,
            horizonteEfetivo: '2026-11-18',
            limiteAtivo: false,
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

describe('PUT /configuracao-agendamento/horizonte', () => {
    it.each([
        [{ horizonteDias: 30, limiteAte: null }, '2026-11-28', false],
        [{ horizonteDias: null, limiteAte: '2026-11-10' }, '2026-11-10', true],
        [{ horizonteDias: 60, limiteAte: '2026-12-15' }, '2026-12-15', true],
        [{ horizonteDias: null, limiteAte: null }, '2026-11-18', false],
    ])('salva configuração %j', async (body, horizonteEfetivo, limiteAtivo) => {
        app = await buildApp();
        configuracaoAgendaMocks.obter.mockImplementation(async () => body);
        configuracaoAgendaMocks.definir.mockResolvedValue(body);

        const response = await app.inject({
            method: 'PUT',
            url: '/configuracao-agendamento/horizonte',
            headers: { cookie: getAuthCookie(app) },
            payload: body,
        });

        expect(response.statusCode).toBe(200);
        expect(configuracaoAgendaMocks.definir).toHaveBeenCalledWith(body);
        expect(response.json()).toMatchObject({
            horizonteDias: body.horizonteDias,
            limiteAte: body.limiteAte,
            horizonteEfetivo,
            limiteAtivo,
        });
    });

    it.each([
        [{ horizonteDias: 0, limiteAte: null }],
        [{ horizonteDias: 181, limiteAte: null }],
        [{ horizonteDias: 1.5, limiteAte: null }],
        [{ horizonteDias: null, limiteAte: '2026-02-30' }],
        [{ horizonteDias: null, limiteAte: '2026/11/01' }],
        [{ horizonteDias: null, limiteAte: '2026-10-28' }],
        [{ horizonteDias: null, limiteAte: '2027-04-28' }],
    ])('rejeita configuração inválida %j', async (body) => {
        app = await buildApp();
        const response = await app.inject({
            method: 'PUT',
            url: '/configuracao-agendamento/horizonte',
            headers: { cookie: getAuthCookie(app) },
            payload: body,
        });

        expect(configuracaoAgendaMocks.definir).not.toHaveBeenCalled();
        expect(response.statusCode).toBe(400);
    });

    it('exige todos os campos e autenticação', async () => {
        app = await buildApp();
        const semCampo = await app.inject({
            method: 'PUT',
            url: '/configuracao-agendamento/horizonte',
            headers: { cookie: getAuthCookie(app) },
            payload: { horizonteDias: 30 },
        });
        const semAuth = await app.inject({
            method: 'PUT',
            url: '/configuracao-agendamento/horizonte',
            payload: { horizonteDias: 30, limiteAte: null },
        });

        expect(semCampo.statusCode).toBe(400);
        expect(semAuth.statusCode).toBe(401);
    });
});
