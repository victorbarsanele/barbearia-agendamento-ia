import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createBooking: vi.fn(),
    validateAvailability: vi.fn(),
    findClient: vi.fn(),
    listClients: vi.fn(),
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
    listarTodos: mocks.listClients,
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
import { processarCicloLembretes } from './pending-agendamento-reminder.service';
import { processarMensagemRecebida } from './whatsapp-incoming-message.service';

const phone = '5511999999999';
const creationId = 'message-created';
const summary =
    'Resumo do seu agendamento:\n- Serviço: Corte\n- Data: terça-feira, 20/10/2026, às 13:00\n- Nome: João Silva\n- Telefone: (11) 99999-9999\n\n*Para confirmar, responda SIM.* Seu horário só será reservado depois da sua confirmação. Se algo estiver errado, me diga o que corrigir.';
const draftValues = {
    nomeCliente: 'João Silva',
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
        const saved = {
            ...draft,
            criadoEm: draft.criadoEm ?? new Date(),
            lembreteEnviadoEm: null,
            resumoEnviadoEm: null,
        };
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

    async listarElegiveisParaLembrete(
        agora: Date,
        criadoAte: Date,
    ): Promise<PendingAgendamento[]> {
        return [...this.drafts.values()]
            .filter(
                (draft) =>
                    draft.lembreteEnviadoEm == null &&
                    draft.expiraEm > agora &&
                    draft.criadoEm <= criadoAte,
            )
            .map((draft) => ({ ...draft }));
    }

    async reivindicarLembrete(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.lembreteEnviadoEm != null ||
            draft.expiraEm <= agora
        ) {
            return false;
        }
        draft.lembreteEnviadoEm = agora;
        return true;
    }

    async marcarResumoEnviado(
        telefoneSessao: string,
        mensagemCriacaoId: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (
            !draft ||
            draft.mensagemCriacaoId !== mensagemCriacaoId ||
            draft.expiraEm <= agora
        ) {
            return false;
        }
        draft.resumoEnviadoEm = agora;
        return true;
    }

    async listarExpirados(agora: Date): Promise<PendingAgendamento[]> {
        return [...this.drafts.values()]
            .filter((draft) => draft.expiraEm < agora)
            .map((draft) => ({ ...draft }));
    }

    async apagarExpirado(
        telefoneSessao: string,
        agora: Date,
    ): Promise<boolean> {
        const draft = this.drafts.get(telefoneSessao);
        if (!draft || draft.expiraEm >= agora) return false;
        this.drafts.delete(telefoneSessao);
        return true;
    }

    async apagar(telefoneSessao: string): Promise<boolean> {
        const existed = this.drafts.has(telefoneSessao);
        this.drafts.delete(telefoneSessao);
        return existed;
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

function seedDraft(
    expiresAt = new Date(currentTime.getTime() + 60_000),
    createdAt = currentTime,
) {
    return pendingRepository.salvar({
        telefoneSessao: phone,
        ...draftValues,
        mensagemCriacaoId: creationId,
        criadoEm: createdAt,
        expiraEm: expiresAt,
    });
}

async function seedSummary(): Promise<void> {
    summaryStore.registrar(phone, {
        mensagemCriacaoId: creationId,
        resumo: summary,
    });
    await pendingRepository.marcarResumoEnviado(phone, creationId, currentTime);
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

function historyTextsFromGeminiRequest(requestIndex = 0): string[] {
    const request = mocks.generateContent.mock.calls[requestIndex]?.[0] as
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
    it('marca reação do cliente e não envia lembrete depois', async () => {
        const expiresAt = new Date(currentTime.getTime() + 20 * 60_000);
        await seedDraft(
            expiresAt,
            new Date(currentTime.getTime() - 10 * 60_000),
        );
        mocks.generateContent.mockResolvedValueOnce({
            text: 'Resposta Gemini.',
        });

        await processarMensagemWhatsapp(phone, 'oi', 'message-reaction');

        await expect(
            pendingRepository.obterValido(phone, currentTime),
        ).resolves.toMatchObject({
            lembreteEnviadoEm: currentTime,
            expiraEm: expiresAt,
        });
        mocks.sendWhatsAppText.mockClear();

        await processarCicloLembretes();

        expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
        await expect(
            pendingRepository.obterValido(phone, currentTime),
        ).resolves.toMatchObject({ expiraEm: expiresAt });
    });

    it('envia resumo do backend após prepararAgendamento, não texto do Gemini', async () => {
        vi.stubEnv('PENDING_BOOKING_TTL_MS', '');
        mocks.generateContent
            .mockResolvedValueOnce({
                functionCalls: [
                    {
                        name: 'prepararAgendamento',
                        id: 'prepare-booking',
                        args: {
                            nomeCliente: 'João Silva',
                            servicoId: 'servico-1',
                            dataHoraInicio: '2026-10-20T13:00:00-03:00',
                        },
                    },
                ],
                candidates: [{ content: { parts: [] } }],
            })
            .mockResolvedValueOnce({ text: 'Resumo reescrito pelo Gemini.' });

        await processarMensagemWhatsapp(
            phone,
            'Quero agendar',
            'message-prepare',
        );

        const expectedSummary = summary.replace('João Silva', 'Cliente');
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            phone,
            expectedSummary,
        );
        expect(summaryStore.obterValido(phone)).toMatchObject({
            mensagemCriacaoId: 'message-prepare',
            resumo: expectedSummary,
        });
        await expect(
            pendingRepository.obterValido(phone, currentTime),
        ).resolves.toMatchObject({
            expiraEm: new Date(currentTime.getTime() + 30 * 60_000),
            resumoEnviadoEm: currentTime,
        });

        await processarMensagemWhatsapp(
            phone,
            'Tenho uma dúvida',
            'message-next',
        );
        const history = historyTextsFromGeminiRequest(2);
        expect(history).toContain(expectedSummary);
        expect(history).not.toContain('Resumo reescrito pelo Gemini.');
    });

    it('reenvia resumo literal em mensagem sem letras ou dígitos, sem Gemini ou consumo do rascunho', async () => {
        await seedDraft();
        const originalDraft = await pendingRepository.obterValido(
            phone,
            currentTime,
        );

        await processarMensagemWhatsapp(phone, '??', 'message-question-mark');

        expect(mocks.generateContent).not.toHaveBeenCalled();
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(phone, summary);
        await expect(
            pendingRepository.obterValido(phone, currentTime),
        ).resolves.toEqual({
            ...originalDraft,
            lembreteEnviadoEm: currentTime,
            resumoEnviadoEm: currentTime,
        });
    });

    it('envia mensagem sem letras ou dígitos ao Gemini quando não há rascunho', async () => {
        await processarMensagemWhatsapp(phone, '?', 'message-question-mark');

        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            phone,
            'Resposta do Gemini.',
        );
    });

    it.each([EstadoEscalonamento.ESCALADO, EstadoEscalonamento.HUMANO_ATIVO])(
        'ignora mensagem sem letras ou dígitos em estado %s',
        async (estado) => {
            await seedDraft();
            escalationRepository.obter = vi.fn().mockResolvedValue({
                estado,
                escaladoEm: currentTime,
            });

            await processarMensagemWhatsapp(
                phone,
                '?',
                'message-question-mark',
            );

            expect(mocks.generateContent).not.toHaveBeenCalled();
            expect(mocks.sendWhatsAppText).not.toHaveBeenCalled();
            await expect(
                pendingRepository.obterValido(phone, currentTime),
            ).resolves.not.toBeNull();
        },
    );

    it('confirma sim com rascunho e marcador, sem LLM, e grava histórico', async () => {
        await seedDraft();
        await seedSummary();
        const infoSpy = vi.spyOn(console, 'info');

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
        expect(infoSpy).toHaveBeenCalledWith(
            '[GEMINI TOOL] confirmarAgendamento confirmado',
            expect.objectContaining({ via: 'atalho' }),
        );
        infoSpy.mockRestore();
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

    it('não mantém cuid da resposta do modelo no histórico', async () => {
        const internalId = 'c123456789012345678901234';
        mocks.generateContent
            .mockResolvedValueOnce({
                text: `Corte (${internalId}) disponível.`,
            })
            .mockResolvedValueOnce({ text: 'Resposta seguinte.' });

        await processarMensagemWhatsapp(phone, 'Tenho horário?', 'message-id');
        await processarMensagemWhatsapp(phone, 'Qual serviço?', 'message-next');

        const secondRequest = mocks.generateContent.mock.calls[1]?.[0] as {
            contents: Array<{ parts?: Array<{ text?: string }> }>;
        };
        const history = JSON.stringify(secondRequest.contents);
        expect(history).toContain('Corte disponível.');
        expect(history).not.toContain(internalId);
    });

    it('usa mensagem atual como evidência de nome durante Function Calling', async () => {
        mocks.findClient.mockResolvedValue(null);
        mocks.listClients.mockResolvedValue([]);
        mocks.generateContent
            .mockResolvedValueOnce({
                functionCalls: [
                    {
                        name: 'prepararAgendamento',
                        id: 'prepare-name',
                        args: {
                            nomeCliente: 'João Silva',
                            servicoId: 'servico-1',
                            dataHoraInicio: '2026-10-20T15:00:00-03:00',
                        },
                    },
                ],
                candidates: [{ content: { parts: [] } }],
            })
            .mockResolvedValueOnce({ text: summary });

        await processarMensagemWhatsapp(
            phone,
            'Meu nome é João Silva',
            'message-current-name',
        );

        await expect(
            pendingRepository.obterValido(phone, currentTime),
        ).resolves.toMatchObject({ nomeCliente: 'João Silva' });
    });

    it('responde já confirmado a segundo sim com outro messageId', async () => {
        await seedDraft();
        await seedSummary();

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
        await seedSummary();

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).not.toHaveBeenCalled();
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it('confirma após 15 minutos mesmo com marcador de memória expirado', async () => {
        await seedDraft(new Date(currentTime.getTime() + 30 * 60_000));
        await seedSummary();
        currentTime = new Date(currentTime.getTime() + 15 * 60_000);
        vi.setSystemTime(currentTime);

        expect(summaryStore.obterValido(phone)).toBeNull();
        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
    });

    it('confirma após reinício simulado sem marcador ou histórico em memória', async () => {
        await seedDraft(new Date(currentTime.getTime() + 30 * 60_000));
        await seedSummary();
        summaryStore.limpar(phone);
        __testables.limparMemoriaConversa(phone);

        await processarMensagemWhatsapp(phone, 'sim', 'message-confirm');

        expect(mocks.createBooking).toHaveBeenCalledTimes(1);
        expect(mocks.generateContent).not.toHaveBeenCalled();
    });

    it('mantém marcador quando resposta LLM reapresenta resumo literal', async () => {
        await seedDraft();
        await seedSummary();
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

    it('não persiste envio quando o WhatsApp falha ao enviar o resumo', async () => {
        await seedDraft();
        mocks.generateContent
            .mockResolvedValueOnce({
                functionCalls: [
                    {
                        name: 'prepararAgendamento',
                        id: 'prepare-booking',
                        args: {
                            nomeCliente: 'João Silva',
                            servicoId: 'servico-1',
                            dataHoraInicio: '2026-10-20T13:00:00-03:00',
                        },
                    },
                ],
                candidates: [{ content: { parts: [] } }],
            })
            .mockResolvedValueOnce({ text: 'Resumo alternativo.' });
        mocks.sendWhatsAppText.mockRejectedValueOnce(
            new Error('whatsapp unavailable'),
        );

        await processarMensagemWhatsapp(
            phone,
            'Quero agendar',
            'message-prepare',
        );

        await expect(
            pendingRepository.obterValido(phone, currentTime),
        ).resolves.toMatchObject({ resumoEnviadoEm: null });
    });

    it('registra via gemini no log de confirmação pela ferramenta', async () => {
        await seedDraft();
        const infoSpy = vi.spyOn(console, 'info');

        await __testables.confirmarAgendamentoTool(
            phone,
            'message-confirm',
            'gemini',
        );

        expect(infoSpy).toHaveBeenCalledWith(
            '[GEMINI TOOL] confirmarAgendamento confirmado',
            expect.objectContaining({ via: 'gemini' }),
        );
    });

    it.each(['sim, mas muda pra 11h', 'não'])(
        'envia mensagem ambígua %s ao Gemini',
        async (text) => {
            await seedDraft();
            await seedSummary();

            await processarMensagemWhatsapp(phone, text, 'message-ambiguous');

            expect(mocks.createBooking).not.toHaveBeenCalled();
            expect(mocks.generateContent).toHaveBeenCalledTimes(1);
        },
    );

    it('conflito usa texto fixo, consome rascunho e próximo sim usa contrato LLM', async () => {
        await seedDraft();
        await seedSummary();
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
        await seedSummary();
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
            await seedSummary();
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
        await seedSummary();

        await processarMensagemWhatsapp(phone, 'sim', null);

        expect(mocks.createBooking).not.toHaveBeenCalled();
        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it('usa messageId original da mensagem de áudio transcrita', async () => {
        await seedDraft();
        await seedSummary();
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
        await seedSummary();
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
