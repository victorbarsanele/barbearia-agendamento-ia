import { expect, test } from '@playwright/test';
import { ApiError } from '../src/services/agendamentos.service.js';
import {
    criarNumeroIgnorado,
    type NumeroIgnorado,
} from '../src/services/numerosIgnorados.service.js';

const numeroCriado: NumeroIgnorado = {
    id: 'numero-1',
    telefone: '5511999999999',
    rotulo: 'Prestador',
    criadoEm: '2026-10-28T12:00:00.000Z',
};

test.describe('service de números ignorados', () => {
    const fetchOriginal = globalThis.fetch;
    let chamadas: { input: RequestInfo | URL; init?: RequestInit }[];
    let resposta: Response;

    test.beforeEach(() => {
        chamadas = [];
        resposta = new Response(JSON.stringify(numeroCriado), { status: 201 });
        globalThis.fetch = async (input, init) => {
            chamadas.push({ input, init });
            return resposta;
        };
    });

    test.afterEach(() => {
        globalThis.fetch = fetchOriginal;
    });

    test('preserva status e code da resposta de erro', async () => {
        resposta = new Response(
            JSON.stringify({
                message: 'Número pertence a cliente cadastrado.',
                code: 'NUMERO_E_CLIENTE',
            }),
            { status: 409 },
        );

        const erro = criarNumeroIgnorado({
            telefone: '+55 (11) 99999-9999',
            rotulo: 'Prestador',
        });

        await expect(erro).rejects.toBeInstanceOf(ApiError);
        await expect(erro).rejects.toMatchObject({
            status: 409,
            body: { code: 'NUMERO_E_CLIENTE' },
        });
    });

    test('envia body sem flag opcional quando não solicitada', async () => {
        await criarNumeroIgnorado({
            telefone: '+55 (11) 99999-9999',
            rotulo: 'Prestador',
        });

        expect(chamadas[0].input).toBe('/api/numeros-ignorados');
        expect(JSON.parse(String(chamadas[0].init?.body))).toEqual({
            telefone: '+55 (11) 99999-9999',
            rotulo: 'Prestador',
        });
    });

    test('envia flag de confirmação quando solicitada', async () => {
        await criarNumeroIgnorado({
            telefone: '+55 (11) 99999-9999',
            rotulo: 'Prestador',
            confirmarMesmoSendoCliente: true,
        });

        expect(JSON.parse(String(chamadas[0].init?.body))).toEqual({
            telefone: '+55 (11) 99999-9999',
            rotulo: 'Prestador',
            confirmarMesmoSendoCliente: true,
        });
    });
});
