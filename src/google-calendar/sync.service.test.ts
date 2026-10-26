import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

vi.mock('./sync.repository', () => ({
    enfileirar: vi.fn(),
    listarAgendamentosDesde: vi.fn(),
}));

import * as syncRepository from './sync.repository';
import { enfileirarSincronizacao } from './sync.service';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('enfileirarSincronizacao', () => {
    it('não consulta outbox com flag desligada', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'false');
        await expect(
            enfileirarSincronizacao(['agendamento-1']),
        ).resolves.toBeUndefined();
        expect(syncRepository.enfileirar).not.toHaveBeenCalled();
    });

    it('não propaga falha do repository', async () => {
        const { privateKey } = generateKeyPairSync('rsa', {
            modulusLength: 2048,
        });
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
        vi.mocked(syncRepository.enfileirar).mockRejectedValue(
            new Error('database unavailable'),
        );
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            enfileirarSincronizacao(['agendamento-1']),
        ).resolves.toBeUndefined();
        expect(syncRepository.enfileirar).toHaveBeenCalledWith([
            'agendamento-1',
        ]);
        expect(log).toHaveBeenCalledOnce();
    });
});
