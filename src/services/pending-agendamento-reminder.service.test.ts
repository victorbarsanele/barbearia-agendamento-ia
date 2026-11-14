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
    iniciarJobLembretesRascunho,
    processarCicloLembretes,
} from './pending-agendamento-reminder.service';

const phone = '5511999999999';
const now = new Date('2026-10-19T12:10:00.000Z');
let repository: InMemoryPendingAgendamentoRepository;
let addToHistorySpy: ReturnType<typeof vi.spyOn>;
let infoSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warningSpy: ReturnType<typeof vi.spyOn>;
let stopJob: (() => void) | undefined;

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
    warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    stopJob?.();
    stopJob = undefined;
    addToHistorySpy.mockRestore();
    infoSpy.mockRestore();
    errorSpy.mockRestore();
    warningSpy.mockRestore();
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

async function flushSchedulerStartup(): Promise<void> {
    for (let index = 0; index < 20; index += 1) {
        await Promise.resolve();
    }
}

async function startJob(): Promise<void> {
    stopJob = iniciarJobLembretesRascunho();
    await flushSchedulerStartup();
}

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

    it('não consulta novamente quando não há rascunhos', async () => {
        const listarExpirados = vi.spyOn(repository, 'listarExpirados');
        const listarElegiveis = vi.spyOn(
            repository,
            'listarElegiveisParaLembrete',
        );
        const listarPrazos = vi.spyOn(repository, 'listarParaAgendamento');

        await startJob();
        expect(listarExpirados).not.toHaveBeenCalled();
        expect(listarElegiveis).not.toHaveBeenCalled();
        expect(listarPrazos).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10 * 60_000);

        expect(listarExpirados).not.toHaveBeenCalled();
        expect(listarElegiveis).not.toHaveBeenCalled();
        expect(listarPrazos).toHaveBeenCalledTimes(1);
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it('envia no prazo calculado e remove no prazo de expiração', async () => {
        await seedDraft({ idadeMs: 0, expiracaoMs: 30 * 60_000 });
        await startJob();

        await vi.advanceTimersByTimeAsync(10 * 60_000 - 1);
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(mocks.sendWhatsAppText).toHaveBeenCalledTimes(1);
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            phone,
            __testables.REMINDER_TEXT,
        );

        await vi.advanceTimersByTimeAsync(20 * 60_000 + 1);
        await expect(
            repository.obterValido(phone, new Date(Date.now())),
        ).resolves.toBeNull();
        expect(mocks.sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it('antecipa o timer quando chega um rascunho com vencimento mais próximo', async () => {
        vi.stubEnv('PENDING_BOOKING_REMINDER_DELAY_MS', '1200000');
        await seedDraft({ idadeMs: -15 * 60_000, expiracaoMs: 40 * 60_000 });
        await startJob();

        vi.stubEnv('PENDING_BOOKING_REMINDER_DELAY_MS', '300000');
        const otherPhone = '5511888888888';
        await seedDraft({
            idadeMs: 0,
            expiracaoMs: 40 * 60_000,
            telefone: otherPhone,
        });

        await vi.advanceTimersByTimeAsync(5 * 60_000 - 1);
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);

        expect(mocks.sendWhatsAppText).toHaveBeenCalledTimes(1);
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            otherPhone,
            __testables.REMINDER_TEXT,
        );
    });

    it('recupera rascunho pendente na varredura de inicialização', async () => {
        await seedDraft({ idadeMs: 9 * 60_000, expiracaoMs: 20 * 60_000 });
        await startJob();
        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();

        stopJob?.();
        stopJob = undefined;
        vi.setSystemTime(new Date(now.getTime() + 60_000));
        await startJob();
        await vi.advanceTimersByTimeAsync(0);

        expect(mocks.sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it('varredura de segurança identifica trabalho sem notificação', async () => {
        vi.stubEnv('PENDING_BOOKING_SAFETY_SWEEP_MS', '60000');
        const listarPrazos = vi.spyOn(repository, 'listarParaAgendamento');
        await startJob();

        listarPrazos.mockResolvedValueOnce([
            {
                telefoneSessao: '5511777777777',
                criadoEm: now,
                expiraEm: new Date(now.getTime() + 30 * 60_000),
                dataHoraInicio: new Date(now.getTime() + 60 * 60_000),
                lembreteEnviadoEm: null,
            },
        ]);
        await vi.advanceTimersByTimeAsync(60_000);

        expect(warningSpy).toHaveBeenCalledWith(
            '[PENDING BOOKING JOB] Varredura encontrou rascunho sem vencimento agendado.',
            {
                evento: 'rascunho_sem_vencimento_agendado',
                quantidade: 1,
            },
        );
        expect(JSON.stringify(warningSpy.mock.calls)).not.toContain(
            '5511777777777',
        );
    });

    it('desliga os timers do scheduler ao fechar', async () => {
        await startJob();
        expect(vi.getTimerCount()).toBe(1);

        stopJob?.();
        stopJob = undefined;

        expect(vi.getTimerCount()).toBe(0);
    });

    it('valida o intervalo da varredura de segurança', () => {
        vi.stubEnv('PENDING_BOOKING_SAFETY_SWEEP_MS', '0');
        expect(__testables.getSafetySweepMs()).toBe(0);
        vi.stubEnv('PENDING_BOOKING_SAFETY_SWEEP_MS', '60000');
        expect(__testables.getSafetySweepMs()).toBe(60_000);
        vi.stubEnv('PENDING_BOOKING_SAFETY_SWEEP_MS', '59999');
        expect(() => __testables.getSafetySweepMs()).toThrow(
            'PENDING_BOOKING_SAFETY_SWEEP_MS inválida',
        );
    });
});
