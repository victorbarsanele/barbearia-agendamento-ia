import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createBooking: vi.fn(),
    validateAvailability: vi.fn(),
    findClient: vi.fn(),
    listServices: vi.fn(),
    generateContent: vi.fn(),
    sendWhatsAppText: vi.fn(),
    transcribeAudio: vi.fn(),
    getAudioConfig: vi.fn(),
    downloadYCloudMedia: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    FunctionCallingConfigMode: { AUTO: 'AUTO' },
    GoogleGenAI: class {
        models = { generateContent: mocks.generateContent };
    },
}));

vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
    isViolacaoDeSobreposicao: (error: unknown) =>
        error instanceof Error && error.message === 'EXCLUSION_CONFLICT',
}));
vi.mock('../repositories/bloqueio.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: mocks.findClient,
    listarTodos: vi.fn().mockResolvedValue([]),
    criar: vi.fn().mockResolvedValue({
        id: 'cliente-1',
        nome: 'Cliente',
        telefone: '5511999999999',
    }),
}));
vi.mock('../repositories/servico.repository', () => ({
    listarTodos: mocks.listServices,
}));
vi.mock('../repositories/pacote.repository', () => ({
    listarLiberadosParaGemini: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/horarioFuncionamento.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
}));
vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    MIN_ANTECEDENCIA_MS: 60 * 60 * 1000,
    criar: mocks.createBooking,
    validarDisponibilidade: mocks.validateAvailability,
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));
vi.mock('./horario-funcionamento.service', () => ({
    carregarConfiguracao: vi.fn().mockResolvedValue(null),
}));
vi.mock('../whatsapp/whatsapp-outbound.service', () => ({
    sendWhatsAppText: mocks.sendWhatsAppText,
}));
vi.mock('../whatsapp/audio-error', () => ({
    describeSafeError: (error: unknown) =>
        error instanceof Error ? error.message : 'unknown',
}));
vi.mock('../whatsapp/audio-config', () => ({
    getAudioConfig: mocks.getAudioConfig,
}));
vi.mock('../whatsapp/ycloud-media-download', () => ({
    AUDIO_TRANSCRIPTION_MIME_TYPES: new Set(['audio/ogg']),
    compareAudioSha256: vi.fn().mockReturnValue(true),
    downloadYCloudMedia: mocks.downloadYCloudMedia,
    normalizeAudioMimeType: (mime: string | null | undefined) => mime ?? null,
}));
vi.mock('./gemini.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./gemini.service')>();
    return { ...actual, transcreverAudio: mocks.transcribeAudio };
});

import { EstadoEscalonamento } from '@prisma/client';
import type { EscalationStateRepository } from '../repositories/escalation-state.repository';
import type {
    PendingAgendamento,
    PendingAgendamentoRepository,
} from '../repositories/pending-agendamento.repository';
import type { IncomingWhatsAppMessage } from '../whatsapp/types';
import { RecentConfirmationStore } from './recent-confirmation.store';
import { ResumoEnviadoStore } from './resumo-enviado.store';
import { __testables, processarMensagemWhatsapp } from './gemini.service';
import { processarMensagemRecebida } from './whatsapp-incoming-message.service';

const phone = '5511999999999';
const creationId = 'message-created';
const summary =
    'Resumo: Corte, terça-feira, 20/10/2026, nome Cliente. Está tudo certo?';
const draftValues = {
    nomeCliente: 'Cliente',
    telefoneCliente: phone,
    servicoId: 'servico-1',
    dataHoraInicio: new Date('2026-10-20T16:00:00.000Z'),
};
const booking = {
    id: 'booking-1',
    cliente: { nome: 'Cliente' },
    servico: { nome: 'Corte' },
    dataHoraInicio: new Date('2026-10-20T16:00:00.000Z'),
    status: 'AGENDADO',
};

class InMemoryPendingRepository implements PendingAgendamentoRepository {
    private readonly drafts = new Map<string, PendingAgendamento>();

    async salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & { criadoEm?: Date },
    ): Promise<PendingAgendamento> {
        const saved = { ...draft, criadoEm: draft.criadoEm ?? new Date() };
        this.drafts.set(saved.telefoneSessao, saved);
        return { ...saved };
    }

    async obterValido(
        telefoneSessao: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const draft = this.drafts.get(telefoneSessao);
        return draft && draft.expiraEm > agora ? { ...draft } : null;
    }

    async consumir(
        telefoneSessao: string,
        messageIdAtual: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.expiraEm <= agora ||
            draft.mensagemCriacaoId === messageIdAtual
        ) {
            return null;
        }
        this.drafts.delete(telefoneSessao);
        return { ...draft };
    }

    async restaurarSeAusente(draft: PendingAgendamento): Promise<boolean> {
        if (this.drafts.has(draft.telefoneSessao)) {
            return false;
        }
        this.drafts.set(draft.telefoneSessao, { ...draft });
        return true;
    }

    async apagar(telefoneSessao: string): Promise<void> {
        this.drafts.delete(telefoneSessao);
    }
}

let pendingRepository: InMemoryPendingRepository;
let summaryStore: ResumoEnviadoStore;
let confirmationStore: RecentConfirmationStore;
let currentTime: Date;

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

function seedDraft(expiresAt = new Date(currentTime.getTime() + 60_000)) {
    return pendingRepository.salvar({
        telefoneSessao: phone,
        ...draftValues,
        mensagemCriacaoId: creationId,
        expiraEm: expiresAt,
    });
}

function seedSummary(): void {
    summaryStore.registrar(phone, {
        mensagemCriacaoId: creationId,
        resumo: summary,
    });
}

function makeIncomingMessage(
    messageId: string,
    text: string,
): IncomingWhatsAppMessage {
    return {
        provider: 'test',
        messageId,
        phone,
        alternateUserId: null,
        kind: 'text',
        rawType: 'text',
        rawSubtype: null,
        text,
        isGroup: false,
        isFromMe: false,
    };
}

function historyTextsFromGeminiRequest(): string[] {
    const request = mocks.generateContent.mock.calls[0]?.[0] as
        | { contents?: Array<{ parts?: Array<{ text?: string }> }> }
        | undefined;
    return (request?.contents ?? [])
        .flatMap((content) => content.parts ?? [])
        .map((part) => part.text)
        .filter((text): text is string => typeof text === 'string');
}

beforeEach(() => {
    vi.useFakeTimers();
    currentTime = new Date('2026-10-15T12:00:00.000Z');
    vi.setSystemTime(currentTime);
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');

    pendingRepository = new InMemoryPendingRepository();
    summaryStore = new ResumoEnviadoStore({ now: () => currentTime });
    confirmationStore = new RecentConfirmationStore({
        now: () => currentTime,
    });
    __testables.setPendingAgendamentoRepository(pendingRepository);
    __testables.setResumoEnviadoStore(summaryStore);
    __testables.setRecentConfirmationStore(confirmationStore);
    __testables.setEscalationStateRepository(escalationRepository);
    __testables.limparMemoriaConversa(phone);

    mocks.findClient.mockResolvedValue({
        id: 'client-1',
        nome: 'Cliente',
        telefone: phone,
    });
    mocks.listServices.mockResolvedValue([
        {
            id: 'servico-1',
            nome: 'Corte',
            duracaoMinutos: 30,
            permiteExtensaoFechamento: false,
        },
    ]);
    mocks.validateAvailability.mockResolvedValue({
        dataHoraInicio: draftValues.dataHoraInicio,
        dataHoraFim: new Date('2026-10-20T16:30:00.000Z'),
    });
    mocks.createBooking.mockResolvedValue(booking);
    mocks.generateContent.mockResolvedValue({ text: 'Resposta do Gemini.' });
    mocks.sendWhatsAppText.mockResolvedValue(undefined);
    mocks.getAudioConfig.mockReturnValue({
        transcriptionEnabled: true,
        maxConcurrency: 1,
        maxQueue: 2,
        maxBytes: 10_000,
        downloadTimeoutMs: 1_000,
    });
    mocks.downloadYCloudMedia.mockResolvedValue({
        ok: true,
        data: new Uint8Array([1, 2, 3]),
        contentType: 'audio/ogg',
    });
    mocks.transcribeAudio.mockResolvedValue({ ok: true, text: 'sim' });
    escalationRepository.obter = vi.fn().mockResolvedValue({
        estado: EstadoEscalonamento.BOT,
        escaladoEm: null,
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('gemini confirmation fast path', () => {
    it('confirma sim com rascunho e marcador, sem LLM, e grava histórico', async () => {
        await seedDraft();
        seedSummary();

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            phone,
            'Agendamento confirmado: Corte, terça-feira, 20/10/2026, 13:00.',
        );

        mocks.generateContent.mockResolvedValueOnce({
            text: 'Posso ajudar com mais alguma coisa?',
        });
        await processarMensagemWhatsapp(phone, 'outra dúvida', 'message-next');
        expect(historyTextsFromGeminiRequest()).toContain('sim');
        expect(historyTextsFromGeminiRequest()).toContain(
            'Agendamento confirmado: Corte, terça-feira, 20/10/2026, 13:00.',
        );
    });

    it('responde já confirmado a segundo sim com outro messageId', async () => {
        await seedDraft();
        seedSummary();

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm-1');
        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm-2');

        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
        expect(mocks.sendWhatsAppText).toHaveBeenLastCalledWith(
            phone,
            'Esse agendamento já está confirmado: Corte, terça-feira, 20/10/2026, 13:00.',
        );
    });

    it('envia sim ao Gemini quando marcador não existe', async () => {
        await seedDraft();

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).not.toHaveBeenCalled();
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it('não confirma rascunho expirado', async () => {
        await seedDraft(new Date(currentTime.getTime() - 1));
        seedSummary();

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).not.toHaveBeenCalled();
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it('limpa marcador se resposta LLM não reapresenta resumo', async () => {
        await seedDraft();
        seedSummary();
        mocks.generateContent.mockResolvedValueOnce({
            text: 'Resposta do Gemini.',
        });

        await processarMensagemWhatsapp(
            phone,
            'Tenho uma dúvida',
            'message-question',
        );
        expect(summaryStore.obterValido(phone)).toBeNull();

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');
        expect(mocks.createBooking).not.toHaveBeenCalled();
        expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    });

    it('mantém marcador quando resposta LLM reapresenta resumo literal', async () => {
        await seedDraft();
        seedSummary();
        mocks.generateContent.mockResolvedValueOnce({ text: summary });

        await processarMensagemWhatsapp(
            phone,
            'Tenho uma dúvida',
            'message-question',
        );
        expect(summaryStore.obterValido(phone)?.mensagemCriacaoId).toBe(
            creationId,
        );

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');
        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it.each(['sim, mas muda pra 11h', 'não'])(
        'envia mensagem ambígua %s ao Gemini',
        async (text) => {
            await seedDraft();
            seedSummary();

            await processarMensagemWhatsapp(phone, text, 'message-ambiguous');

            expect(mocks.createBooking).not.toHaveBeenCalled();
            expect(mocks.generateContent).toHaveBeenCalledTimes(1);
        },
    );

    it('conflito usa texto fixo, consome rascunho e próximo sim usa contrato LLM', async () => {
        await seedDraft();
        seedSummary();
        mocks.createBooking.mockRejectedValueOnce(
            new Error('EXCLUSION_CONFLICT'),
        );
        mocks.generateContent
            .mockResolvedValueOnce({
                functionCalls: [
                    {
                        name: 'confirmarAgendamento',
                        id: 'call-confirm',
                        args: {},
                    },
                ],
                candidates: [{ content: { parts: [] } }],
            })
            .mockImplementationOnce(
                async (request: {
                    contents: Array<{ parts?: Array<Record<string, unknown>> }>;
                }) => {
                    const functionResponse = request.contents
                        .flatMap((content) => content.parts ?? [])
                        .map(
                            (part) =>
                                part.functionResponse as
                                    | {
                                          response?: {
                                              result?: { instrucao?: string };
                                          };
                                      }
                                    | undefined,
                        )
                        .find(
                            (response) => response?.response?.result?.instrucao,
                        );
                    expect(
                        functionResponse?.response?.result?.instrucao,
                    ).toContain('chame prepararAgendamento agora');
                    return { text: 'Vou preparar um novo resumo.' };
                },
            );

        await processarMensagemWhatsapp(phone, 'sim', 'message-conflict');
        expect(mocks.sendWhatsAppText).toHaveBeenLastCalledWith(
            phone,
            'Esse horário acabou de ser reservado por outro cliente. Qual outro dia ou horário você prefere? Posso verificar a disponibilidade.',
        );
        expect(mocks.createBooking).toHaveBeenCalledTimes(1);

        await processarMensagemWhatsapp(phone, 'sim', 'message-after-conflict');
        expect(mocks.generateContent).toHaveBeenCalledTimes(2);
        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
    });

    it('restaura rascunho após erro inesperado e tenta novamente no segundo sim', async () => {
        await seedDraft();
        seedSummary();
        mocks.createBooking
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValueOnce(booking);

        await processarMensagemWhatsapp(phone, 'sim', 'message-retry-1');
        expect(mocks.sendWhatsAppText).toHaveBeenLastCalledWith(
            phone,
            'Não consegui concluir o agendamento agora. Envie "sim" de novo para eu tentar mais uma vez.',
        );
        expect(
            await pendingRepository.obterValido(phone, currentTime),
        ).not.toBeNull();

        await processarMensagemWhatsapp(phone, 'sim', 'message-retry-2');
        expect(mocks.createBooking).toHaveBeenCalledTimes(2);
        expect(mocks.sendWhatsAppText).toHaveBeenLastCalledWith(
            phone,
            'Agendamento confirmado: Corte, terça-feira, 20/10/2026, 13:00.',
        );
    });

    it.each([EstadoEscalonamento.ESCALADO, EstadoEscalonamento.HUMANO_ATIVO])(
        'não usa atalho em estado %s',
        async (estado) => {
            await seedDraft();
            seedSummary();
            escalationRepository.obter = vi.fn().mockResolvedValue({
                estado,
                escaladoEm: currentTime,
            });

            await processarMensagemWhatsapp(phone, 'sim', 'message-state');

            expect(mocks.createBooking).not.toHaveBeenCalled();
            expect(mocks.generateContent).not.toHaveBeenCalled();
        },
    );

    it('messageId ausente segue para Gemini sem confirmar', async () => {
        await seedDraft();
        seedSummary();

        await processarMensagemWhatsapp(phone, 'sim', null);

        expect(mocks.createBooking).not.toHaveBeenCalled();
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it('usa messageId original da mensagem de áudio transcrita', async () => {
        await seedDraft();
        seedSummary();
        const audioMessage: IncomingWhatsAppMessage = {
            ...makeIncomingMessage('audio-original-id', ''),
            kind: 'non_text',
            rawType: 'audio',
            text: null,
            media: {
                link: 'https://media.test/audio.ogg',
                id: 'audio-id',
                sha256: null,
                mimeType: 'audio/ogg',
            },
        };

        await processarMensagemRecebida(audioMessage);

        expect(mocks.transcribeAudio).toHaveBeenCalledTimes(1);
        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
    });

    it('serializa dois sims concorrentes pela fila do telefone', async () => {
        await seedDraft();
        seedSummary();
        let releaseCreation!: () => void;
        let markCreationStarted!: () => void;
        const creationStarted = new Promise<void>((resolve) => {
            markCreationStarted = resolve;
        });
        const creationGate = new Promise<void>((resolve) => {
            releaseCreation = resolve;
        });
        mocks.createBooking.mockImplementationOnce(async () => {
            markCreationStarted();
            await creationGate;
            return booking;
        });

        const first = processarMensagemRecebida(
            makeIncomingMessage('message-queued-1', 'sim'),
        );
        await creationStarted;
        const second = processarMensagemRecebida(
            makeIncomingMessage('message-queued-2', 'sim'),
        );
        releaseCreation();
        await Promise.all([first, second]);

        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
        expect(mocks.sendWhatsAppText).toHaveBeenLastCalledWith(
            phone,
            'Esse agendamento já está confirmado: Corte, terça-feira, 20/10/2026, 13:00.',
        );
    });
});
