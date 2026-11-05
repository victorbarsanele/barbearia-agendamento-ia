import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import {
    REATIVACAO_PAYLOAD_AGENDAR,
    REATIVACAO_PAYLOAD_OPTOUT,
    REATIVACAO_TEMPLATE_NOME,
    TEXTO_TEMPLATE_REATIVACAO,
} from '../whatsapp/ycloud-reativacao';

const mocks = vi.hoisted(() => ({
    buscarPorId: vi.fn(),
    numeroEstaIgnorado: vi.fn(),
    getWhatsAppProvider: vi.fn(),
    getWhatsAppAllowlist: vi.fn(),
    reservarEnvioReativacao: vi.fn(),
    marcarEnvioAceito: vi.fn(),
    marcarEnvioFalhou: vi.fn(),
    sendYCloudTemplate: vi.fn(),
    addToHistory: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorId: mocks.buscarPorId,
}));
vi.mock('../repositories/reativacao.repository', () => ({
    getReativacaoRepository: vi.fn(() => ({
        reservarEnvioReativacao: mocks.reservarEnvioReativacao,
        marcarEnvioAceito: mocks.marcarEnvioAceito,
        marcarEnvioFalhou: mocks.marcarEnvioFalhou,
    })),
}));
vi.mock('../services/gemini.service', () => ({
    addToHistory: mocks.addToHistory,
}));
vi.mock('./numero-ignorado-whatsapp.service', () => ({
    numeroEstaIgnorado: mocks.numeroEstaIgnorado,
}));
vi.mock('../whatsapp/allowlist', () => ({
    getWhatsAppAllowlist: mocks.getWhatsAppAllowlist,
}));
vi.mock('../whatsapp/config', () => ({
    getWhatsAppProvider: mocks.getWhatsAppProvider,
}));
vi.mock('../whatsapp/ycloud-outbound.adapter', () => ({
    sendYCloudTemplate: mocks.sendYCloudTemplate,
}));

import { reativarCliente } from './reativacao.service';

const cliente = { id: 'cliente-1', telefone: '5511999999999' };
const agora = new Date('2026-11-04T12:00:00.000Z');

beforeEach(() => {
    vi.clearAllMocks();
    mocks.buscarPorId.mockResolvedValue(cliente);
    mocks.numeroEstaIgnorado.mockResolvedValue(false);
    mocks.getWhatsAppProvider.mockReturnValue('ycloud');
    mocks.getWhatsAppAllowlist.mockReturnValue({
        active: false,
        phones: new Set(),
    });
    mocks.reservarEnvioReativacao.mockResolvedValue({
        ok: true,
        envioId: 'envio-1',
    });
    mocks.marcarEnvioAceito.mockResolvedValue(undefined);
    mocks.marcarEnvioFalhou.mockResolvedValue(undefined);
    mocks.sendYCloudTemplate.mockResolvedValue({
        id: 'ycloud-id-1',
        status: 'accepted',
    });
    mocks.addToHistory.mockReturnValue(undefined);
});

describe('reativacao.service.reativarCliente', () => {
    it('rejeita cliente inexistente e telefone ausente', async () => {
        mocks.buscarPorId.mockResolvedValueOnce(null);
        await expect(reativarCliente('ausente', agora)).rejects.toMatchObject({
            statusCode: 404,
            details: { motivo: 'CLIENTE_NAO_ENCONTRADO' },
        });

        mocks.buscarPorId.mockResolvedValueOnce({ ...cliente, telefone: ' ' });
        await expect(reativarCliente('cliente-1', agora)).rejects.toMatchObject(
            {
                statusCode: 422,
                details: { motivo: 'TELEFONE_AUSENTE' },
            },
        );
    });

    it('bloqueia número ignorado antes da reserva', async () => {
        mocks.numeroEstaIgnorado.mockResolvedValueOnce(true);

        await expect(reativarCliente('cliente-1', agora)).rejects.toMatchObject(
            {
                statusCode: 422,
                details: { motivo: 'NUMERO_IGNORADO' },
            },
        );
        expect(mocks.reservarEnvioReativacao).not.toHaveBeenCalled();
    });

    it('bloqueia provedor sem suporte e telefone fora da allowlist', async () => {
        mocks.getWhatsAppProvider.mockReturnValueOnce('evolution');
        await expect(reativarCliente('cliente-1', agora)).rejects.toMatchObject(
            {
                statusCode: 503,
                details: { motivo: 'PROVEDOR_SEM_SUPORTE' },
            },
        );

        mocks.getWhatsAppAllowlist.mockReturnValueOnce({
            active: true,
            phones: new Set(['5511888888888']),
        });
        await expect(reativarCliente('cliente-1', agora)).rejects.toMatchObject(
            {
                statusCode: 422,
                details: { motivo: 'FORA_DA_ALLOWLIST' },
            },
        );
        expect(mocks.reservarEnvioReativacao).not.toHaveBeenCalled();
    });

    it.each([
        [{ ok: false, motivo: 'OPT_OUT' }, 'OPT_OUT', undefined],
        [
            {
                ok: false,
                motivo: 'COOLDOWN',
                ate: new Date('2026-12-01T00:00:00Z'),
            },
            'COOLDOWN',
            new Date('2026-12-01T00:00:00Z'),
        ],
    ])(
        'converte bloqueio da reserva %j em erro de domínio',
        async (reserva, motivo, ate) => {
            mocks.reservarEnvioReativacao.mockResolvedValueOnce(reserva);

            await expect(
                reativarCliente('cliente-1', agora),
            ).rejects.toMatchObject({
                statusCode: 409,
                details: {
                    motivo,
                    ...(ate ? { bloqueadoAte: ate } : {}),
                },
            });
            expect(mocks.sendYCloudTemplate).not.toHaveBeenCalled();
        },
    );

    it('reserva antes do envio e grava aceite/histórico com telefone inbound canônico', async () => {
        const order: string[] = [];
        mocks.reservarEnvioReativacao.mockImplementation(async () => {
            order.push('reserva');
            return { ok: true, envioId: 'envio-1' };
        });
        mocks.sendYCloudTemplate.mockImplementation(async () => {
            order.push('send');
            return { id: 'ycloud-id-1', status: 'accepted' };
        });
        mocks.marcarEnvioAceito.mockImplementation(async () => {
            order.push('accepted');
        });
        mocks.addToHistory.mockImplementation(() => {
            order.push('history');
        });

        await expect(reativarCliente('cliente-1', agora)).resolves.toEqual({
            envioId: 'envio-1',
            status: 'ACEITA',
        });

        expect(order).toEqual(['reserva', 'send', 'accepted', 'history']);
        expect(mocks.sendYCloudTemplate).toHaveBeenCalledWith(
            '5511999999999',
            REATIVACAO_TEMPLATE_NOME,
            [],
            [
                {
                    type: 'button',
                    sub_type: 'quick_reply',
                    index: 0,
                    parameters: [
                        {
                            type: 'payload',
                            payload: REATIVACAO_PAYLOAD_AGENDAR,
                        },
                    ],
                },
                {
                    type: 'button',
                    sub_type: 'quick_reply',
                    index: 1,
                    parameters: [
                        { type: 'payload', payload: REATIVACAO_PAYLOAD_OPTOUT },
                    ],
                },
            ],
        );
        expect(mocks.marcarEnvioAceito).toHaveBeenCalledWith(
            'envio-1',
            'ycloud-id-1',
        );
        expect(mocks.addToHistory).toHaveBeenCalledWith(
            '5511999999999',
            'model',
            TEXTO_TEMPLATE_REATIVACAO,
        );
    });

    it('marca falha de envio e não altera histórico', async () => {
        mocks.sendYCloudTemplate.mockRejectedValueOnce(
            new Error('timeout de envio'),
        );

        await expect(
            reativarCliente('cliente-1', agora),
        ).rejects.toBeInstanceOf(AppError);
        expect(mocks.marcarEnvioFalhou).toHaveBeenCalledWith(
            'envio-1',
            'timeout de envio',
        );
        expect(mocks.marcarEnvioAceito).not.toHaveBeenCalled();
        expect(mocks.addToHistory).not.toHaveBeenCalled();
    });

    it('marca falha se YCloud aceitar sem devolver ID', async () => {
        mocks.sendYCloudTemplate.mockResolvedValueOnce({ status: 'accepted' });

        await expect(reativarCliente('cliente-1', agora)).rejects.toMatchObject(
            {
                statusCode: 502,
                details: { motivo: 'FALHA_ENVIO' },
            },
        );

        expect(mocks.marcarEnvioFalhou).toHaveBeenCalledWith(
            'envio-1',
            'Resposta YCloud sem ID da mensagem.',
        );
        expect(mocks.marcarEnvioAceito).not.toHaveBeenCalled();
        expect(mocks.addToHistory).not.toHaveBeenCalled();
    });
});
