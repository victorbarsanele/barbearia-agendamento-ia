import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const googleSyncMocks = vi.hoisted(() => ({
    listarIdsFuturosPorServico: vi.fn(),
    enfileirarSincronizacao: vi.fn(),
}));

vi.mock('../google-calendar/sync.repository', () => ({
    listarIdsFuturosPorServico: googleSyncMocks.listarIdsFuturosPorServico,
}));
vi.mock('../google-calendar/sync.service', () => ({
    enfileirarSincronizacao: googleSyncMocks.enfileirarSincronizacao,
}));
vi.mock('../repositories/agendamento.repository', () => ({}));
vi.mock('../repositories/servico.repository', () => ({
    buscarPorId: vi.fn(),
    atualizar: vi.fn(),
}));

import * as servicoRepository from '../repositories/servico.repository';
import * as servicoService from './servico.service';

const servicoExistente = {
    id: 'servico-1',
    nome: 'Corte',
    duracaoMinutos: 30,
    preco: null,
    permiteExtensaoFechamento: false,
};

function habilitarGoogleSync(): void {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
    vi.stubEnv(
        'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
        Buffer.from(
            JSON.stringify({
                client_email: 'calendar@example.test',
                private_key: privateKey.export({
                    type: 'pkcs8',
                    format: 'pem',
                }),
            }),
        ).toString('base64'),
    );
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'calendar-id');
}

describe('servico.service.atualizar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        googleSyncMocks.listarIdsFuturosPorServico.mockResolvedValue([
            'agendamento-1',
        ]);
        googleSyncMocks.enfileirarSincronizacao.mockResolvedValue(undefined);
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(
            servicoExistente as never,
        );
        vi.mocked(servicoRepository.atualizar).mockResolvedValue({
            ...servicoExistente,
            nome: 'Corte atualizado',
        } as never);
    });

    afterEach(() => vi.unstubAllEnvs());

    it('enfileira futuros quando nome muda e tolera falha do outbox', async () => {
        habilitarGoogleSync();
        googleSyncMocks.enfileirarSincronizacao.mockRejectedValueOnce(
            new Error('outbox unavailable'),
        );

        await expect(
            servicoService.atualizar('servico-1', {
                nome: 'Corte atualizado',
                duracaoMinutos: 30,
            }),
        ).resolves.toMatchObject({ nome: 'Corte atualizado' });
        expect(googleSyncMocks.listarIdsFuturosPorServico).toHaveBeenCalledWith(
            'servico-1',
        );
        expect(googleSyncMocks.enfileirarSincronizacao).toHaveBeenCalledWith([
            'agendamento-1',
        ]);
    });

    it('não consulta agendamentos quando flag está desligada', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'false');

        await servicoService.atualizar('servico-1', {
            nome: 'Corte atualizado',
            duracaoMinutos: 30,
        });

        expect(
            googleSyncMocks.listarIdsFuturosPorServico,
        ).not.toHaveBeenCalled();
        expect(googleSyncMocks.enfileirarSincronizacao).not.toHaveBeenCalled();
    });
});
