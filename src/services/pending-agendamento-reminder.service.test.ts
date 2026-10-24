import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendWhatsAppText: vi.fn() }));

vi.mock('../whatsapp/whatsapp-outbound.service', () => ({
    sendWhatsAppText: mocks.sendWhatsAppText,
}));

import { EstadoEscalonamento } from '@prisma/client';
import {
    InMemoryPendingAgendamentoRepository,
    setPendingAgendamentoRepository,
} from '../repositories/pending-agendamento.repository';
import {
    setEscalationStateRepository,
    type EscalationStateRepository,
} from '../repositories/escalation-state.repository';
import * as geminiService from './gemini.service';
import {
    __testables,
    processarCicloLembretes,
} from './pending-agendamento-reminder.service';

const phone = '5511999999999';
const now = new Date('2026-10-19T12:10:00.000Z');
let repository: InMemoryPendingAgendamentoRepository;
let addToHistorySpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

const escalationRepository = {
    obter: vi.fn(),
    escalar: vi.fn(),
    reivindicarAviso: vi.fn(),
    liberarAviso: vi.fn(),
    reivindicarAvisoMidia: vi.fn(),
    liberarAvisoMidia: vi.fn(),
    registrarRespostaHumana: vi.fn(),
    registrarRespostaHumanaIdempotente: vi.fn(),
} as unknown as EscalationStateRepository;

async function seedDraft(
    options: {
        idadeMs?: number;
        expiracaoMs?: number;
        inicioMs?: number;
        telefone?: string;
    } = {},
) {
    const telefone = options.telefone ?? phone;
    const createdAt = new Date(
        now.getTime() - (options.idadeMs ?? 10 * 60_000),
    );
    return repository.salvar({
        telefoneSessao: telefone,
        nomeCliente: 'Nome privado',
        telefoneCliente: telefone,
        servicoId: 'servico-1',
        dataHoraInicio: new Date(
            now.getTime() + (options.inicioMs ?? 28 * 60 * 60_000),
        ),
        mensagemCriacaoId: 'message-created',
        criadoEm: createdAt,
        expiraEm: new Date(
            now.getTime() + (options.expiracaoMs ?? 20 * 60_000),
        ),
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.resetAllMocks();
    vi.stubEnv('WHATSAPP_ALLOWLIST', '');
    repository = new InMemoryPendingAgendamentoRepository();
    setPendingAgendamentoRepository(repository);
    setEscalationStateRepository(escalationRepository);
    escalationRepository.obter = vi.fn().mockResolvedValue(null);
    mocks.sendWhatsAppText.mockResolvedValue(undefined);
    addToHistorySpy = vi.spyOn(geminiService, 'addToHistory');
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    addToHistorySpy.mockRestore();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('pending booking reminder job', () => {
    it('usa 10 minutos por padrão e aceita delay configurável', () => {
        vi.stubEnv('PENDING_BOOKING_REMINDER_DELAY_MS', '');
        expect(__testables.getReminderDelayMs()).toBe(10 * 60_000);

        vi.stubEnv('PENDING_BOOKING_REMINDER_DELAY_MS', '120000');
        expect(__testables.getReminderDelayMs()).toBe(120_000);
    });

    it('envia lembrete a rascunho elegível e registra no histórico', async () => {
        await seedDraft();

        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            phone,
            __testables.REMINDER_TEXT,
        );
        expect(addToHistorySpy).toHaveBeenCalledWith(
            phone,
            'model',
            __testables.REMINDER_TEXT,
        );
        await expect(repository.obterValido(phone, now)).resolves.toMatchObject(
            { lembreteEnviadoEm: now },
        );
    });

    it('não reenvia após segundo ciclo', async () => {
        await seedDraft();

        await processarCicloLembretes();
        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it('não envia antes dos 10 minutos', async () => {
        await seedDraft({ idadeMs: 9 * 60_000 });

        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it('não envia quando restam menos de 3 minutos para expirar', async () => {
        await seedDraft({ expiracaoMs: 2 * 60_000 });

        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it('não envia quando o horário já começou', async () => {
        await seedDraft({ inicioMs: -1 });

        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it.each([EstadoEscalonamento.HUMANO_ATIVO, EstadoEscalonamento.ESCALADO])(
        'não envia quando telefone está em %s e mantém claim',
        async (estado) => {
            await seedDraft();
            escalationRepository.obter = vi.fn().mockResolvedValue({ estado });

            await processarCicloLembretes();

            expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
            await expect(
                repository.obterValido(phone, now),
            ).resolves.toMatchObject({ lembreteEnviadoEm: now });
        },
    );

    it('não envia para telefone fora da allowlist ativa e mantém claim', async () => {
        await seedDraft();
        vi.stubEnv('WHATSAPP_ALLOWLIST', '5511888888888');

        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
        await expect(repository.obterValido(phone, now)).resolves.toMatchObject(
            { lembreteEnviadoEm: now },
        );
    });

    it('apaga expirado e registra evento sem PII', async () => {
        await seedDraft({ expiracaoMs: -1 });

        await processarCicloLembretes();

        await expect(repository.obterValido(phone, now)).resolves.toBeNull();
        const eventCall = infoSpy.mock.calls.find(
            (call: unknown[]) => call[0] === '[GEMINI TOOL] rascunho_expirado',
        );
        expect(eventCall?.[1]).toMatchObject({
            evento: 'rascunho_expirado',
            lembreteEnviado: false,
            idadeSegundos: 600,
        });
        expect(JSON.stringify(eventCall)).not.toContain(phone);
        expect(JSON.stringify(eventCall)).not.toContain('Nome privado');
    });

    it('falha de envio não derruba ciclo nem causa nova tentativa', async () => {
        await seedDraft();
        await seedDraft({ telefone: '5511888888888' });
        mocks.sendWhatsAppText.mockRejectedValueOnce(
            new Error('provider error'),
        );

        await expect(processarCicloLembretes()).resolves.toBeUndefined();
        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).toHaveBeenCalledTimes(2);
        expect(mocks.sendWhatsAppText).toHaveBeenNthCalledWith(
            2,
            '5511888888888',
            __testables.REMINDER_TEXT,
        );
        expect(errorSpy).toHaveBeenCalledWith(
            '[PENDING BOOKING JOB] Falha ao processar rascunho.',
            { evento: 'falha_ao_enviar_lembrete' },
        );
    });
});
