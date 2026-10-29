import cookie from '@fastify/cookie';
import Fastify, { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import { resetRevokedTokens, registerAuthPlugin } from '../plugins/auth.plugin';
import { numeroIgnoradoWhatsAppRoutes } from './numero-ignorado-whatsapp.routes';

const serviceMock = vi.hoisted(() => ({
    listar: vi.fn(),
    criar: vi.fn(),
    excluirPorId: vi.fn(),
}));

vi.mock('../services/numero-ignorado-whatsapp.service', () => serviceMock);

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
    const fastifyApp = Fastify();
    await fastifyApp.register(cookie);
    await fastifyApp.register(registerAuthPlugin);
    await fastifyApp.register(numeroIgnoradoWhatsAppRoutes);
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
    serviceMock.listar.mockResolvedValue([]);
    serviceMock.criar.mockResolvedValue({
        id: 'ignored-1',
        telefone: '5511998765432',
        rotulo: 'Contato',
        criadoEm: new Date('2026-10-28T12:00:00.000Z'),
    });
    serviceMock.excluirPorId.mockResolvedValue(undefined);
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
    vi.unstubAllEnvs();
});

describe('numeros-ignorados routes', () => {
    it('exige autenticação', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'GET',
            url: '/numeros-ignorados',
        });

        expect(response.statusCode).toBe(401);
        expect(serviceMock.listar).not.toHaveBeenCalled();
    });

    it('remove propriedades extras antes de chamar service', async () => {
        app = await buildApp();
        const response = await app.inject({
            method: 'POST',
            url: '/numeros-ignorados',
            headers: { cookie: getAuthCookie(app) },
            payload: {
                telefone: '11987654321',
                rotulo: 'Contato',
                extra: true,
            },
        });

        expect(response.statusCode).toBe(201);
        expect(serviceMock.criar).toHaveBeenCalledWith({
            telefone: '11987654321',
            rotulo: 'Contato',
        });
    });

    it('retorna código de conflito do service', async () => {
        app = await buildApp();
        serviceMock.criar.mockRejectedValueOnce(
            new AppError('Número pertence a cliente cadastrado.', 409, {
                code: 'NUMERO_E_CLIENTE',
            }),
        );
        const response = await app.inject({
            method: 'POST',
            url: '/numeros-ignorados',
            headers: { cookie: getAuthCookie(app) },
            payload: { telefone: '11987654321', rotulo: 'Contato' },
        });

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ code: 'NUMERO_E_CLIENTE' });
    });

    it('lista, cria e exclui com autenticação', async () => {
        app = await buildApp();
        const cookieHeader = getAuthCookie(app);
        const list = await app.inject({
            method: 'GET',
            url: '/numeros-ignorados',
            headers: { cookie: cookieHeader },
        });
        const create = await app.inject({
            method: 'POST',
            url: '/numeros-ignorados',
            headers: { cookie: cookieHeader },
            payload: { telefone: '11987654321', rotulo: 'Contato' },
        });
        const remove = await app.inject({
            method: 'DELETE',
            url: '/numeros-ignorados/ignored-1',
            headers: { cookie: cookieHeader },
        });

        expect(list.statusCode).toBe(200);
        expect(create.statusCode).toBe(201);
        expect(remove.statusCode).toBe(204);
        expect(serviceMock.criar).toHaveBeenCalledWith({
            telefone: '11987654321',
            rotulo: 'Contato',
        });
        expect(serviceMock.excluirPorId).toHaveBeenCalledWith('ignored-1');
    });
});
