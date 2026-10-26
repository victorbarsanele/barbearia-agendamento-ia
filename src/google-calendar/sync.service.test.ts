import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

vi.mock('./sync.repository', () => ({
    TAMANHO_LOTE_ENFILEIRAMENTO: 20,
    enfileirar: vi.fn(),
    listarAgendamentosDesde: vi.fn(),
}));

import * as syncRepository from './sync.repository';
import {
    enfileirarSincronizacao,
    reconciliarGoogleAgenda,
} from './sync.service';
import type { GoogleCalendarAdapter } from './google-calendar.adapter';

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

function habilitarGoogleSync(): void {
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
}

describe('enfileirarSincronizacao', () => {
    it('não consulta outbox com flag desligada', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'false');
        await expect(
            enfileirarSincronizacao(['agendamento-1']),
        ).resolves.toEqual({ total: 0, falhas: 0 });
        expect(syncRepository.enfileirar).not.toHaveBeenCalled();
    });

    it('deduplica IDs e retorna total/falhas do repository', async () => {
        habilitarGoogleSync();
        vi.mocked(syncRepository.enfileirar).mockResolvedValue({
            total: 2,
            falhas: 0,
            lotesFalhos: [],
        });

        await expect(
            enfileirarSincronizacao([
                'agendamento-1',
                'agendamento-1',
                'agendamento-2',
            ]),
        ).resolves.toEqual({ total: 2, falhas: 0 });
        expect(syncRepository.enfileirar).toHaveBeenCalledWith([
            'agendamento-1',
            'agendamento-2',
        ]);
    });

    it('não lança e loga metadados seguros quando repository falha', async () => {
        habilitarGoogleSync();
        vi.mocked(syncRepository.enfileirar).mockRejectedValue(
            Object.assign(new Error('secret database message'), {
                code: 'P2028',
            }),
        );
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            enfileirarSincronizacao(['private-agendamento-id']),
        ).resolves.toEqual({ total: 1, falhas: 1 });

        expect(log).toHaveBeenCalledWith(
            '[GOOGLE CALENDAR] Falha ao enfileirar sincronização.',
            expect.objectContaining({
                nome: 'Error',
                codigo: 'P2028',
                quantidadeIds: 1,
                indiceLote: 0,
                totalLotes: 1,
                duracaoMs: expect.any(Number),
            }),
        );
        const textoLog = JSON.stringify(log.mock.calls);
        expect(textoLog).not.toContain('private-agendamento-id');
        expect(textoLog).not.toContain('secret database message');
    });

    it('loga falha de lote sem IDs nem mensagem original', async () => {
        habilitarGoogleSync();
        vi.mocked(syncRepository.enfileirar).mockResolvedValue({
            total: 2,
            falhas: 2,
            lotesFalhos: [
                {
                    erro: new Error('private database message'),
                    quantidadeIds: 2,
                    indiceLote: 2,
                    totalLotes: 3,
                    duracaoMs: 20_001,
                },
            ],
        });
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            enfileirarSincronizacao(['id-private-1', 'id-private-2']),
        ).resolves.toEqual({ total: 2, falhas: 2 });

        expect(log).toHaveBeenCalledWith(
            '[GOOGLE CALENDAR] Falha ao enfileirar sincronização.',
            expect.objectContaining({
                nome: 'Error',
                quantidadeIds: 2,
                indiceLote: 2,
                totalLotes: 3,
                duracaoMs: 20_001,
            }),
        );
        const textoLog = JSON.stringify(log.mock.calls);
        expect(textoLog).not.toContain('id-private');
        expect(textoLog).not.toContain('private database message');
    });
});

describe('reconciliarGoogleAgenda', () => {
    const agendamento = {
        id: 'secret-agendamento-id',
        dataHoraInicio: new Date('2026-10-27T13:00:00.000Z'),
        dataHoraFim: new Date('2026-10-27T13:30:00.000Z'),
        status: 'AGENDADO',
        concluido: false,
        cliente: { nome: 'Private Name', telefone: '5511999999999' },
        servico: { nome: 'Corte' },
    };

    it('sinaliza falha parcial e loga resumo sem dados de cliente', async () => {
        habilitarGoogleSync();
        vi.mocked(syncRepository.listarAgendamentosDesde).mockResolvedValue([
            agendamento,
        ] as never);
        vi.mocked(syncRepository.enfileirar).mockResolvedValue({
            total: 1,
            falhas: 1,
            lotesFalhos: [
                {
                    erro: new Error('private db message'),
                    quantidadeIds: 1,
                    indiceLote: 1,
                    totalLotes: 1,
                    duracaoMs: 20_001,
                },
            ],
        });
        const adapter = {
            listarEventos: vi.fn().mockResolvedValue([]),
        } as unknown as GoogleCalendarAdapter;
        const info = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            reconciliarGoogleAgenda(adapter, new Date('2026-10-26T12:00:00Z')),
        ).resolves.toMatchObject({
            sucesso: false,
            agendamentosConsiderados: 1,
            eventosListados: 0,
            divergentes: 1,
            enfileirados: 0,
            falhas: 1,
            duracaoMs: expect.any(Number),
        });

        expect(info).toHaveBeenCalledOnce();
        expect(info.mock.calls[0]).toEqual([
            '[GOOGLE CALENDAR] Resumo da reconciliação.',
            expect.objectContaining({
                agendamentosConsiderados: 1,
                eventosListados: 0,
                divergentes: 1,
                enfileirados: 0,
                falhas: 1,
                duracaoMs: expect.any(Number),
            }),
        ]);
        const textoLog = JSON.stringify(info.mock.calls);
        expect(textoLog).not.toContain('secret-agendamento-id');
        expect(textoLog).not.toContain('Private Name');
        expect(textoLog).not.toContain('5511999999999');
    });

    it('propaga falha total de consulta após emitir resumo', async () => {
        habilitarGoogleSync();
        const adapter = {
            listarEventos: vi
                .fn()
                .mockRejectedValue(new Error('private Google error')),
        } as unknown as GoogleCalendarAdapter;
        const info = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(reconciliarGoogleAgenda(adapter)).rejects.toThrow(
            'private Google error',
        );
        expect(info).toHaveBeenCalledOnce();
        expect(info.mock.calls[0]?.[1]).toMatchObject({ falhas: 1 });
        expect(JSON.stringify(info.mock.calls)).not.toContain(
            'private Google error',
        );
    });
});
