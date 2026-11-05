import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import { resetRevokedTokens, registerAuthPlugin } from '../plugins/auth.plugin';
import { clienteRoutes } from './cliente.routes';

const serviceMock = vi.hoisted(() => ({ reativarCliente: vi.fn() }));

vi.mock('../services/reativacao.service', () => serviceMock);

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
    const fastifyApp = Fastify();
    await fastifyApp.register(cookie);
    await fastifyApp.register(registerAuthPlugin);
    await fastifyApp.register(clienteRoutes);
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
    serviceMock.reativarCliente.mockResolvedValue({
        envioId: 'envio-1',
        status: 'ACEITA',
    });
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
    vi.unstubAllEnvs();
});

describe('POST /clientes/:clienteId/reativacao-whatsapp', () => {
    it('exige JWT em cookie', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'POST',
            url: '/clientes/cliente-1/reativacao-whatsapp',
        });

        expect(response.statusCode).toBe(401);
        expect(serviceMock.reativarCliente).not.toHaveBeenCalled();
    });

    it('retorna 202 com ID e status aceito', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'POST',
            url: '/clientes/cliente-1/reativacao-whatsapp',
            headers: { cookie: getAuthCookie(app) },
        });

        expect(response.statusCode).toBe(202);
        expect(response.json()).toEqual({
            envioId: 'envio-1',
            status: 'ACEITA',
        });
        expect(serviceMock.reativarCliente).toHaveBeenCalledWith('cliente-1');
    });

    it.each([
        [404, { motivo: 'CLIENTE_NAO_ENCONTRADO' }],
        [409, { motivo: 'OPT_OUT' }],
        [
            409,
            {
                motivo: 'COOLDOWN',
                bloqueadoAte: new Date('2026-12-01T00:00:00Z'),
            },
        ],
        [422, { motivo: 'NUMERO_IGNORADO' }],
        [503, { motivo: 'PROVEDOR_SEM_SUPORTE' }],
        [502, { motivo: 'FALHA_ENVIO' }],
    ])('serializa erro de domínio HTTP %i', async (statusCode, details) => {
        app = await buildApp();
        serviceMock.reativarCliente.mockRejectedValueOnce(
            new AppError('Falha de reativação.', statusCode, details),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/clientes/cliente-1/reativacao-whatsapp',
            headers: { cookie: getAuthCookie(app) },
        });

        expect(response.statusCode).toBe(statusCode);
        expect(response.json()).toMatchObject({ motivo: details.motivo });
        if ('bloqueadoAte' in details) {
            expect(response.json().bloqueadoAte).toBe(
                '2026-12-01T00:00:00.000Z',
            );
        }
    });
});
