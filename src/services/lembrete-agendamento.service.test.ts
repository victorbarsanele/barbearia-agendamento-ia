import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendamentoParaLembrete } from '../repositories/lembrete-agendamento.repository';
import {
    enviarLembreteAgendamento,
    montarBotoesTemplateLembrete,
    montarParametrosTemplateLembrete,
    processarCliqueLembrete,
    consumirContextoRemarcacao,
} from './lembrete-agendamento.service';
import {
    LEMBRETE_TEXTO_CONFIRMAR,
    LEMBRETE_TEXTO_INATIVO,
    LEMBRETE_TEXTO_REMARCAR,
} from '../whatsapp/ycloud-lembrete';

const mocks = vi.hoisted(() => ({
    repository: {
        obterAgendamento: vi.fn(),
        obterUltimo: vi.fn(),
        reservar: vi.fn(),
        marcarAceito: vi.fn(),
        marcarFalhou: vi.fn(),
        confirmarPorCliente: vi.fn(),
        registrarContextoRemarcacao: vi.fn(),
        consumirContextoRemarcacao: vi.fn(),
    },
    sendYCloudTemplate: vi.fn(),
    numeroEstaIgnorado: vi.fn(),
}));

vi.mock('../repositories/lembrete-agendamento.repository', () => ({
    getLembreteAgendamentoRepository: () => mocks.repository,
}));
vi.mock('../whatsapp/ycloud-outbound.adapter', () => ({
    sendYCloudTemplate: mocks.sendYCloudTemplate,
}));
vi.mock('./numero-ignorado-whatsapp.service', () => ({
    numeroEstaIgnorado: mocks.numeroEstaIgnorado,
}));

const AGORA_TESTE = new Date('2026-11-06T12:00:00Z');

function makeAppointment(
    overrides: Partial<AgendamentoParaLembrete> = {},
): AgendamentoParaLembrete {
    return {
        id: 'agendamento-1',
        status: StatusAgendamento.AGENDADO,
        dataHoraInicio: new Date('2026-11-07T18:05:00.000Z'),
        cliente: { nome: 'Apelido interno', telefone: '5511999999999' },
        servico: { nome: 'Corte' },
        ...overrides,
    };
}

beforeEach(() => {
    vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
    vi.stubEnv('WHATSAPP_ALLOWLIST', '');
    vi.clearAllMocks();
    mocks.repository.obterAgendamento.mockResolvedValue(makeAppointment());
    mocks.repository.reservar.mockResolvedValue({
        ok: true,
        envioId: 'envio-1',
        agendamento: makeAppointment(),
    });
    mocks.repository.marcarAceito.mockResolvedValue(undefined);
    mocks.repository.marcarFalhou.mockResolvedValue(undefined);
    mocks.repository.confirmarPorCliente.mockResolvedValue(true);
    mocks.repository.registrarContextoRemarcacao.mockResolvedValue(true);
    mocks.repository.consumirContextoRemarcacao.mockResolvedValue(null);
    mocks.sendYCloudTemplate.mockResolvedValue({
        id: 'ycloud-message-1',
        status: 'accepted',
    });
    mocks.numeroEstaIgnorado.mockResolvedValue(false);
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('lembrete template payload', () => {
    it('sends exactly three positional body values and excludes customer name', async () => {
        const appointment = makeAppointment();
        const parameters = montarParametrosTemplateLembrete(appointment);

        expect(parameters).toEqual([
            { type: 'text', text: 'Corte' },
            { type: 'text', text: '07/11' },
            { type: 'text', text: '15:05' },
        ]);
        expect(parameters).toHaveLength(3);
        expect(JSON.stringify(parameters)).not.toContain('Apelido interno');

        await enviarLembreteAgendamento(
            appointment.id,
            new Date('2026-11-06T12:00:00Z'),
        );
        expect(mocks.sendYCloudTemplate.mock.calls[0]?.[2]).toEqual(parameters);
        expect(mocks.sendYCloudTemplate.mock.calls[0]?.[3]).toEqual([
            {
                type: 'button',
                sub_type: 'quick_reply',
                index: 0,
                parameters: [
                    {
                        type: 'payload',
                        payload: 'lembrete:confirmar:agendamento-1',
                    },
                ],
            },
            {
                type: 'button',
                sub_type: 'quick_reply',
                index: 1,
                parameters: [
                    {
                        type: 'payload',
                        payload: 'lembrete:remarcar:agendamento-1',
                    },
                ],
            },
        ]);
    });

    it('builds dynamic button payloads for appointment ID', () => {
        expect(
            montarBotoesTemplateLembrete('id-2').map(
                (button) => button.parameters[0]?.payload,
            ),
        ).toEqual(['lembrete:confirmar:id-2', 'lembrete:remarcar:id-2']);
    });
});

describe('enviarLembreteAgendamento', () => {
    it('marks accepted send with YCloud message ID', async () => {
        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).resolves.toMatchObject({ status: 'ACEITO' });
        expect(mocks.repository.marcarAceito).toHaveBeenCalledWith(
            'envio-1',
            'ycloud-message-1',
            expect.any(Date),
        );
    });

    it('marks provider failure and missing message ID as failed', async () => {
        mocks.sendYCloudTemplate.mockRejectedValueOnce(
            new Error('provider failed'),
        );
        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).rejects.toMatchObject({ statusCode: 502 });
        expect(mocks.repository.marcarFalhou).toHaveBeenCalledWith(
            'envio-1',
            'provider failed',
        );

        mocks.sendYCloudTemplate.mockResolvedValueOnce({ status: 'accepted' });
        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).rejects.toMatchObject({ statusCode: 502 });
        expect(mocks.repository.marcarFalhou).toHaveBeenCalledTimes(2);
    });

    it('logs attempt context when recording provider failure also fails', async () => {
        mocks.sendYCloudTemplate.mockRejectedValueOnce(
            new Error('provider failed'),
        );
        mocks.repository.marcarFalhou.mockRejectedValueOnce(
            new Error('database unavailable'),
        );
        const errorLog = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).rejects.toMatchObject({ statusCode: 502 });

        expect(mocks.repository.marcarFalhou).toHaveBeenCalledOnce();
        expect(errorLog).toHaveBeenCalledWith(
            '[LEMBRETE] Falha ao registrar tentativa como falha.',
            expect.objectContaining({
                agendamentoId: 'agendamento-1',
                tentativaId: 'envio-1',
                providerMessageId: null,
                motivoFalha: 'provider failed',
                erro: 'database unavailable',
            }),
        );
        errorLog.mockRestore();
    });

    it('does not mark accepted send failed when ACEITO persistence keeps failing', async () => {
        mocks.repository.marcarAceito.mockRejectedValue(
            new Error('database unavailable'),
        );
        const errorLog = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).rejects.toMatchObject({
            statusCode: 500,
            message:
                'Lembrete enviado; falha ao registrar o estado. Verifique antes de reenviar.',
            details: { motivo: 'FALHA_REGISTRO_LEMBRETE_ACEITO' },
        });

        expect(mocks.sendYCloudTemplate).toHaveBeenCalledOnce();
        expect(mocks.repository.marcarAceito).toHaveBeenCalledTimes(3);
        expect(mocks.repository.marcarFalhou).not.toHaveBeenCalled();
        expect(errorLog).toHaveBeenCalledWith(
            '[LEMBRETE] Envio aceito, mas falha ao persistir estado.',
            expect.objectContaining({
                agendamentoId: 'agendamento-1',
                tentativaId: 'envio-1',
                providerMessageId: 'ycloud-message-1',
            }),
        );
        errorLog.mockRestore();
    });

    it('allows retry after failed attempt and blocks active or accepted attempt', async () => {
        mocks.sendYCloudTemplate.mockRejectedValueOnce(new Error('temporary'));
        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).rejects.toMatchObject({ statusCode: 502 });
        mocks.sendYCloudTemplate.mockResolvedValueOnce({ id: 'retry-id' });
        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).resolves.toMatchObject({ status: 'ACEITO' });

        mocks.repository.reservar.mockResolvedValueOnce({
            ok: false,
            motivo: 'LEMBRETE_JA_ENVIADO',
        });
        await expect(
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejects concurrent duplicate reservations', async () => {
        let pending = false;
        mocks.repository.reservar.mockImplementation(async () => {
            if (pending) return { ok: false, motivo: 'LEMBRETE_PENDENTE' };
            pending = true;
            return {
                ok: true,
                envioId: 'envio-concorrente',
                agendamento: makeAppointment(),
            };
        });
        const results = await Promise.allSettled([
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
            enviarLembreteAgendamento(
                'agendamento-1',
                new Date('2026-11-06T12:00:00Z'),
            ),
        ]);

        expect(
            results.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        expect(
            results.filter((result) => result.status === 'rejected'),
        ).toHaveLength(1);
        expect(mocks.sendYCloudTemplate).toHaveBeenCalledTimes(1);
    });

    it('blocks ignored, out-of-allowlist, inactive, and past appointments', async () => {
        mocks.numeroEstaIgnorado.mockResolvedValueOnce(true);
        await expect(
            enviarLembreteAgendamento('agendamento-1', AGORA_TESTE),
        ).rejects.toMatchObject({ details: { motivo: 'NUMERO_IGNORADO' } });

        vi.stubEnv('WHATSAPP_ALLOWLIST', '5511888888888');
        await expect(
            enviarLembreteAgendamento('agendamento-1', AGORA_TESTE),
        ).rejects.toMatchObject({ details: { motivo: 'FORA_DA_ALLOWLIST' } });

        vi.stubEnv('WHATSAPP_ALLOWLIST', '');
        mocks.repository.obterAgendamento.mockResolvedValueOnce(
            makeAppointment({ status: StatusAgendamento.CANCELADO }),
        );
        await expect(
            enviarLembreteAgendamento('agendamento-1', AGORA_TESTE),
        ).rejects.toMatchObject({
            details: { motivo: 'AGENDAMENTO_NAO_ATIVO' },
        });

        mocks.repository.obterAgendamento.mockResolvedValueOnce(
            makeAppointment({
                dataHoraInicio: new Date('2020-01-01T00:00:00Z'),
            }),
        );
        await expect(
            enviarLembreteAgendamento('agendamento-1', AGORA_TESTE),
        ).rejects.toMatchObject({
            details: { motivo: 'AGENDAMENTO_NAO_ATIVO' },
        });
        expect(mocks.repository.reservar).not.toHaveBeenCalled();
    });
});

describe('processarCliqueLembrete', () => {
    const action = {
        type: 'lembrete' as const,
        action: 'confirmar' as const,
        agendamentoId: 'agendamento-1',
    };

    it('confirms active matching appointment idempotently', async () => {
        await expect(
            processarCliqueLembrete('5511999999999', action),
        ).resolves.toBe(LEMBRETE_TEXTO_CONFIRMAR);
        await expect(
            processarCliqueLembrete('5511999999999', action),
        ).resolves.toBe(LEMBRETE_TEXTO_CONFIRMAR);
        expect(mocks.repository.confirmarPorCliente).toHaveBeenCalledTimes(2);
    });

    it('returns inactive response for a different phone or invalid status without changing appointment', async () => {
        await expect(
            processarCliqueLembrete('5511888888888', action),
        ).resolves.toBe(LEMBRETE_TEXTO_INATIVO);
        mocks.repository.obterAgendamento.mockResolvedValueOnce(
            makeAppointment({ status: StatusAgendamento.CONCLUIDO }),
        );
        await expect(
            processarCliqueLembrete('5511999999999', action),
        ).resolves.toBe(LEMBRETE_TEXTO_INATIVO);
        expect(mocks.repository.confirmarPorCliente).not.toHaveBeenCalled();
    });

    it('records durable rescheduling context for 24 hours without changing appointment', async () => {
        const now = new Date('2026-11-06T12:00:00Z');
        await expect(
            processarCliqueLembrete(
                '5511999999999',
                { ...action, action: 'remarcar' },
                now,
            ),
        ).resolves.toBe(LEMBRETE_TEXTO_REMARCAR);
        expect(
            mocks.repository.registrarContextoRemarcacao,
        ).toHaveBeenCalledWith(
            '5511999999999',
            'agendamento-1',
            new Date('2026-11-07T12:00:00Z'),
            now,
        );
        expect(mocks.repository.confirmarPorCliente).not.toHaveBeenCalled();
    });

    it('consumes context once and creates system context without internal appointment ID', async () => {
        mocks.repository.consumirContextoRemarcacao
            .mockResolvedValueOnce({
                agendamentoId: 'private-id',
                servico: 'Corte',
                dataHoraInicio: new Date('2026-11-07T18:05:00.000Z'),
            })
            .mockResolvedValueOnce(null);
        const first = await consumirContextoRemarcacao(
            '5511999999999',
            new Date('2026-11-06T12:00:00Z'),
        );
        const second = await consumirContextoRemarcacao(
            '5511999999999',
            new Date('2026-11-06T12:00:00Z'),
        );

        expect(first).toContain('Corte');
        expect(first).toContain('07/11 às 15:05');
        expect(first).not.toContain('private-id');
        expect(second).toBeUndefined();
    });
});
