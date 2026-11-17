import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clienteRoutes } from './cliente.routes';

const clienteServiceMock = vi.hoisted(() => ({
    listarTodos: vi.fn(),
    listarPaginadoComTotalAgendamentos: vi.fn(),
}));

vi.mock('../services/cliente.service', () => clienteServiceMock);
vi.mock('../services/reativacao.service', () => ({
    reativarCliente: vi.fn(),
}));

let app: FastifyInstance | null = null;

async function buildApp(): Promise<FastifyInstance> {
    const fastifyApp = Fastify();
    await fastifyApp.register(clienteRoutes);
    await fastifyApp.ready();
    return fastifyApp;
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(async () => {
    if (app) {
        await app.close();
        app = null;
    }
});

describe('GET /clientes', () => {
    it('mantém o array sem parâmetros no formato atual', async () => {
        const clientes = [
            {
                id: 'cliente-1',
                nome: 'Maria',
                telefone: '5511999990000',
                optOutMarketingEm: null,
                createdAt: '2026-01-02T00:00:00.000Z',
            },
        ];
        clienteServiceMock.listarTodos.mockResolvedValue(clientes);
        app = await buildApp();

        const response = await app.inject({ method: 'GET', url: '/clientes' });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(clientes);
        expect(response.json()[0]).not.toHaveProperty('totalAgendamentos');
        expect(clienteServiceMock.listarTodos).toHaveBeenCalledOnce();
        expect(
            clienteServiceMock.listarPaginadoComTotalAgendamentos,
        ).not.toHaveBeenCalled();
    });

    it('retorna a contagem aditiva apenas no envelope paginado', async () => {
        clienteServiceMock.listarPaginadoComTotalAgendamentos.mockResolvedValue(
            {
                clientes: [
                    {
                        id: 'cliente-1',
                        nome: 'Maria',
                        telefone: '5511999990000',
                        optOutMarketingEm: null,
                        createdAt: '2026-01-02T00:00:00.000Z',
                        totalAgendamentos: 0,
                    },
                ],
                total: 1,
                page: 1,
                totalPages: 1,
            },
        );
        app = await buildApp();

        const response = await app.inject({
            method: 'GET',
            url: '/clientes?page=1&limit=10',
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            data: [
                {
                    id: 'cliente-1',
                    nome: 'Maria',
                    telefone: '5511999990000',
                    optOutMarketingEm: null,
                    createdAt: '2026-01-02T00:00:00.000Z',
                    totalAgendamentos: 0,
                },
            ],
            total: 1,
            page: 1,
            totalPages: 1,
        });
        expect(response.json().data[0]).not.toHaveProperty('_count');
        expect(
            clienteServiceMock.listarPaginadoComTotalAgendamentos,
        ).toHaveBeenCalledWith({ search: undefined, page: 1, limit: 10 });
    });
});
