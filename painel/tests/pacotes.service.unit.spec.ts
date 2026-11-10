import { expect, test } from '@playwright/test';
import { ApiError } from '../src/services/agendamentos.service.js';
import {
    arquivarPacote,
    desarquivarPacote,
    excluirPacote,
    listarPacotes,
} from '../src/services/pacotes.service.js';

test('lista situação padrão sem query e envia situações explícitas', async () => {
    const fetchOriginal = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = async (input) => {
        requests.push(String(input));
        return Response.json([]);
    };

    try {
        await listarPacotes();
        await listarPacotes('arquivados');
        await listarPacotes('todos');

        expect(requests).toEqual([
            '/api/pacotes',
            '/api/pacotes?situacao=arquivados',
            '/api/pacotes?situacao=todos',
        ]);
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});

test('arquiva e desarquiva usando POST e retorna pacote de catálogo', async () => {
    const fetchOriginal = globalThis.fetch;
    const requests: { input: string; method?: string }[] = [];
    globalThis.fetch = async (input, init) => {
        requests.push({ input: String(input), method: init?.method });
        return Response.json({
            id: 'pacote-1',
            arquivadoEm: '2026-11-10T12:00:00.000Z',
            ciclosAtivos: 2,
        });
    };

    try {
        const arquivado = await arquivarPacote('pacote-1');
        const desarquivado = await desarquivarPacote('pacote-1');

        expect(requests).toEqual([
            { input: '/api/pacotes/pacote-1/arquivar', method: 'POST' },
            { input: '/api/pacotes/pacote-1/desarquivar', method: 'POST' },
        ]);
        expect(arquivado.ciclosAtivos).toBe(2);
        expect(desarquivado.arquivadoEm).toBe('2026-11-10T12:00:00.000Z');
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});

test('propaga ApiError com status e code da raiz do body', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () =>
        Response.json(
            {
                message: 'O pacote tem histórico de vendas.',
                code: 'PACOTE_COM_HISTORICO',
            },
            { status: 409 },
        );

    try {
        await expect(excluirPacote('pacote-1')).rejects.toMatchObject({
            name: 'ApiError',
            status: 409,
            message: 'O pacote tem histórico de vendas.',
            body: { code: 'PACOTE_COM_HISTORICO' },
        });
        await expect(excluirPacote('pacote-1')).rejects.toBeInstanceOf(
            ApiError,
        );
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});

test('mantém fallback Error quando resposta de erro não contém JSON', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () =>
        new Response('resposta inválida', { status: 500 });

    try {
        await expect(listarPacotes()).rejects.toMatchObject({
            name: 'Error',
            message: 'Erro ao processar requisição.',
        });
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});
