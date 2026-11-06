import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import { resetRevokedTokens, registerAuthPlugin } from '../plugins/auth.plugin';
import { agendamentoRoutes } from './agendamento.routes';

const serviceMock = vi.hoisted(() => ({
    enviarLembreteAgendamento: vi.fn(),
}));

vi.mock('../services/lembrete-agendamento.service', () => serviceMock);
vi.mock('../services/agendamento.service', () => ({}));

import { enviarLembreteAgendamento } from '../services/lembrete-agendamento.service';

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
    const fastifyApp = Fastify();
    await fastifyApp.register(cookie);
    await fastifyApp.register(registerAuthPlugin);
    await fastifyApp.register(agendamentoRoutes);
    await fastifyApp.ready();
    return fastifyApp;
}

function getAuthCookie(fastifyApp: FastifyInstance): string {
    const token = fastifyApp.jwt.sign({ username: 'admin', role: 'admin' });
    return `token=${token}`;
}

beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'jwt-secret-teste');
    vi.clearAllMocks();
    resetRevokedTokens();
    vi.mocked(enviarLembreteAgendamento).mockResolvedValue({
        status: 'ACEITO',
        aceitoEm: new Date('2026-11-06T15:00:00.000Z'),
    });
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
    vi.unstubAllEnvs();
});

describe('POST /agendamentos/:id/lembrete', () => {
    it('requires an authenticated cookie', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos/agendamento-1/lembrete',
        });

        expect(response.statusCode).toBe(401);
        expect(enviarLembreteAgendamento).not.toHaveBeenCalled();
    });

    it('returns 202 with accepted status and timestamp', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos/agendamento-1/lembrete',
            headers: { cookie: getAuthCookie(app) },
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            status: 'ACEITO',
            aceitoEm: '2026-11-06T15:00:00.000Z',
        });
        expect(enviarLembreteAgendamento).toHaveBeenCalledWith('agendamento-1');
    });

    it('preserves structured domain errors', async () => {
        app = await buildApp();
        vi.mocked(enviarLembreteAgendamento).mockRejectedValueOnce(
            new AppError('Lembrete já foi aceito pela YCloud.', 409, {
                motivo: 'LEMBRETE_JA_ENVIADO',
            }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/agendamentos/agendamento-1/lembrete',
            headers: { cookie: getAuthCookie(app) },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({
            motivo: 'LEMBRETE_JA_ENVIADO',
        });
    });
});
