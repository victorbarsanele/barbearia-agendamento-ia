import { expect, test } from '@playwright/test';
import { ApiError } from '../src/services/agendamentos.service.js';
import { vincularPacoteCliente } from '../src/services/pacoteCliente.service.js';

test('vinculação propaga ApiError com status, code e mensagem original', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () =>
        Response.json(
            {
                message:
                    'Este pacote foi arquivado e não está mais disponível.',
                code: 'PACOTE_ARQUIVADO',
            },
            { status: 409 },
        );

    try {
        await expect(
            vincularPacoteCliente({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            }),
        ).rejects.toMatchObject({
            name: 'ApiError',
            status: 409,
            message: 'Este pacote foi arquivado e não está mais disponível.',
            body: { code: 'PACOTE_ARQUIVADO' },
        });
        await expect(
            vincularPacoteCliente({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            }),
        ).rejects.toBeInstanceOf(ApiError);
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});

test('mantém fallback Error quando resposta de erro não contém JSON', async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () =>
        new Response('resposta inválida', { status: 500 });

    try {
        await expect(
            vincularPacoteCliente({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            }),
        ).rejects.toMatchObject({
            name: 'Error',
            message: 'Erro ao processar requisição.',
        });
    } finally {
        globalThis.fetch = fetchOriginal;
    }
});
