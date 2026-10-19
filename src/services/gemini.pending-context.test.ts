import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createBooking: vi.fn(),
    validateAvailability: vi.fn(),
    findClient: vi.fn(),
    listServices: vi.fn(),
    generateContent: vi.fn(),
    sendWhatsAppText: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    FunctionCallingConfigMode: { AUTO: 'AUTO' },
    GoogleGenAI: class {
        models = { generateContent: mocks.generateContent };
    },
}));
vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
    isViolacaoDeSobreposicao: vi.fn().mockReturnValue(false),
}));
vi.mock('../repositories/bloqueio.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: mocks.findClient,
    listarTodos: vi.fn().mockResolvedValue([]),
    criar: vi.fn(),
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
    getAudioConfig: vi.fn().mockReturnValue({}),
}));

import { EstadoEscalonamento } from '@prisma/client';
import type { EscalationStateRepository } from '../repositories/escalation-state.repository';
import type {
    PendingAgendamento,
    PendingAgendamentoRepository,
} from '../repositories/pending-agendamento.repository';
import { __testables, processarMensagemWhatsapp } from './gemini.service';
import { RecentConfirmationStore } from './recent-confirmation.store';
import { ResumoEnviadoStore } from './resumo-enviado.store';

const phone = '5511999999999';
const createdMessageId = 'message-created';
const service = {
    id: 'service-cut',
    nome: 'Corte social, Degradê ou Tesoura',
    duracaoMinutos: 60,
    permiteExtensaoFechamento: false,
};
const draftValues = {
    nomeCliente: 'João Silva',
    telefoneCliente: phone,
    servicoId: service.id,
    dataHoraInicio: new Date('2026-10-17T18:00:00.000Z'),
};

class MemoryPendingRepository implements PendingAgendamentoRepository {
    private readonly drafts = new Map<string, PendingAgendamento>();

    async salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & { criadoEm?: Date },
    ): Promise<PendingAgendamento> {
        const value = {
            ...draft,
            criadoEm: draft.criadoEm ?? new Date(),
            lembreteEnviadoEm: null,
            resumoEnviadoEm: null,
        };
        this.drafts.set(value.telefoneSessao, value);
        return { ...value };
    }

    async obterValido(
        telefoneSessao: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const value = this.drafts.get(telefoneSessao);
        return value && value.expiraEm > agora ? { ...value } : null;
    }

    async consumir(
        telefoneSessao: string,
        messageIdAtual: string,
        agora: Date,
    ): Promise<PendingAgendamento | null> {
        const value = this.drafts.get(telefoneSessao);
        if (
            !value ||
            value.expiraEm <= agora ||
            value.mensagemCriacaoId === messageIdAtual
        ) {
            return null;
        }
        this.drafts.delete(telefoneSessao);
        return { ...value };
    }

    async restaurarSeAusente(draft: PendingAgendamento): Promise<boolean> {
        if (this.drafts.has(draft.telefoneSessao)) return false;
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

let pendingRepository: MemoryPendingRepository;
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
    options: {
        messageId?: string;
        expiresAt?: Date;
        servicoId?: string;
        telefoneCliente?: string;
    } = {},
): Promise<PendingAgendamento> {
    return pendingRepository.salvar({
        telefoneSessao: phone,
        ...draftValues,
        mensagemCriacaoId: options.messageId ?? createdMessageId,
        expiraEm: options.expiresAt ?? new Date(currentTime.getTime() + 60_000),
        servicoId: options.servicoId ?? service.id,
        telefoneCliente: options.telefoneCliente ?? phone,
    });
}

function latestGeminiRequest(): {
    config: {
        systemInstruction: string;
        tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
    };
} {
    return mocks.generateContent.mock.calls.at(-1)![0] as {
        config: {
            systemInstruction: string;
            tools: Array<{ functionDeclarations: Array<{ name: string }> }>;
        };
    };
}

function toolNames(request: ReturnType<typeof latestGeminiRequest>): string[] {
    return request.config.tools[0].functionDeclarations.map(
        (declaration) => declaration.name,
    );
}

async function sendAmbiguousTurn(messageId = 'message-current') {
    await processarMensagemWhatsapp(phone, 'sim, mas muda pra 11h', messageId);
    return latestGeminiRequest();
}

beforeEach(() => {
    vi.useFakeTimers();
    currentTime = new Date('2026-10-15T12:00:00.000Z');
    vi.setSystemTime(currentTime);
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');

    pendingRepository = new MemoryPendingRepository();
    __testables.setPendingAgendamentoRepository(pendingRepository);
    __testables.setResumoEnviadoStore(
        new ResumoEnviadoStore({ now: () => currentTime }),
    );
    __testables.setRecentConfirmationStore(
        new RecentConfirmationStore({ now: () => currentTime }),
    );
    __testables.setEscalationStateRepository(escalationRepository);
    __testables.limparMemoriaConversa(phone);

    mocks.findClient.mockResolvedValue({
        id: 'client-1',
        nome: 'Cliente Teste',
        telefone: phone,
    });
    mocks.listServices.mockResolvedValue([service]);
    mocks.validateAvailability.mockResolvedValue({
        dataHoraInicio: draftValues.dataHoraInicio,
        dataHoraFim: new Date('2026-10-17T19:00:00.000Z'),
    });
    mocks.createBooking.mockResolvedValue({
        id: 'booking-1',
        cliente: { nome: 'Cliente Teste' },
        servico: { nome: service.nome },
        dataHoraInicio: draftValues.dataHoraInicio,
        status: 'AGENDADO',
    });
    mocks.generateContent.mockResolvedValue({ text: 'Resposta Gemini.' });
    mocks.sendWhatsAppText.mockResolvedValue(undefined);
    escalationRepository.obter = vi.fn().mockResolvedValue({
        estado: EstadoEscalonamento.BOT,
        escaladoEm: null,
    });
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
});

describe('gemini pending context', () => {
    it('inclui contexto e confirmation tool para rascunho anterior ambíguo', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        await seedDraft();

        const request = await sendAmbiguousTurn();
        const prompt = request.config.systemInstruction;

        expect(prompt).toContain(
            'Rascunho pendente aguardando confirmação do cliente:',
        );
        expect(prompt).toContain(
            'a duração e o preço retornados por buscarServicos podem ser informados quando úteis',
        );
        expect(prompt).toContain('IDs e códigos internos (cuid)');
        expect(prompt).toContain('nunca em texto ao cliente');
        expect(prompt).toContain('servicoId=service-cut');
        expect(prompt).toContain('nome=João Silva');
        expect(prompt).toContain(
            'o telefone do rascunho é o número deste WhatsApp',
        );
        expect(toolNames(request)).toContain('confirmarAgendamento');
        expect(toolNames(request)).toContain('prepararAgendamento');
        const turnLog = log.mock.calls.find(
            ([label]) => label === '[GEMINI TURNO]',
        );
        expect(turnLog?.[1]).toMatchObject({
            rascunhoPendenteNoInicio: true,
        });
        log.mockRestore();
    });

    it.each([
        ['sem rascunho', 'none'],
        ['rascunho expirado', 'expired'],
        ['rascunho da mensagem atual', 'current'],
    ])('omite contexto e confirmação para %s', async (_label, state) => {
        if (state === 'expired') {
            await seedDraft({
                expiresAt: new Date(currentTime.getTime() - 1),
            });
        } else if (state === 'current') {
            await seedDraft({ messageId: 'message-current' });
        }

        const request = await sendAmbiguousTurn();

        expect(request.config.systemInstruction).not.toContain(
            'Rascunho pendente aguardando confirmação do cliente:',
        );
        expect(toolNames(request)).not.toContain('confirmarAgendamento');
    });

    it('omite bloco quando serviço do rascunho não existe, mas mantém tool pelo rascunho válido', async () => {
        await seedDraft({ servicoId: 'missing-service' });

        const request = await sendAmbiguousTurn();

        expect(request.config.systemInstruction).not.toContain(
            'Rascunho pendente aguardando confirmação do cliente:',
        );
        expect(toolNames(request)).toContain('confirmarAgendamento');
    });

    it('reconstrói resumo igual ao retorno de prepararAgendamento', async () => {
        const prepared = await __testables.prepararAgendamentoTool(
            phone,
            createdMessageId,
            {
                nomeCliente: draftValues.nomeCliente,
                servicoId: service.id,
                dataHoraInicio: '2026-10-17T15:00:00-03:00',
            },
            ['João Silva'],
        );
        expect(prepared.sucesso).toBe(true);
        await sendAmbiguousTurn();

        expect(latestGeminiRequest().config.systemInstruction).toContain(
            prepared.resumo!,
        );
    });

    it('identifica telefone de outro número informado após normalização', async () => {
        await seedDraft({ telefoneCliente: '5511888888888' });

        const request = await sendAmbiguousTurn();

        expect(request.config.systemInstruction).toContain(
            'o telefone do rascunho é outro número informado pelo cliente',
        );
        expect(request.config.systemInstruction).not.toContain(
            'o telefone do rascunho é o número deste WhatsApp',
        );
    });

    it('usa mesmo telefone normalizado como WhatsApp padrão', async () => {
        await seedDraft({ telefoneCliente: '+55 (11) 99999-9999' });

        const request = await sendAmbiguousTurn();

        expect(request.config.systemInstruction).toContain(
            'o telefone do rascunho é o número deste WhatsApp',
        );
    });

    it('omite confirmation tool quando não há rascunho no início', async () => {
        const request = await sendAmbiguousTurn();

        expect(toolNames(request)).not.toContain('confirmarAgendamento');
        expect(toolNames(request)).toContain('prepararAgendamento');
    });

    it('loga apenas nomes de tools, iterações e presença de rascunho', async () => {
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});
        mocks.generateContent
            .mockResolvedValueOnce({
                functionCalls: [
                    {
                        name: 'buscarServicos',
                        id: 'call-services',
                        args: { ignored: 'texto privado 5511999999999' },
                    },
                    {
                        name: 'consultarPacotesDisponiveis',
                        id: 'call-packages',
                        args: {},
                    },
                ],
                candidates: [{ content: { parts: [] } }],
            })
            .mockResolvedValueOnce({ text: 'Resposta Gemini.' });

        await processarMensagemWhatsapp(
            phone,
            'conteúdo privado',
            'message-log',
        );

        const entry = log.mock.calls.find(
            ([label]) => label === '[GEMINI TURNO]',
        );
        expect(entry?.[1]).toEqual({
            toolsChamadas: ['buscarServicos', 'consultarPacotesDisponiveis'],
            iteracoes: 2,
            rascunhoPendenteNoInicio: false,
        });
        expect(JSON.stringify(entry)).not.toContain('conteúdo privado');
        expect(JSON.stringify(entry)).not.toContain('5511999999999');
        log.mockRestore();
    });

    it('registra falha de serviço com argumento mascarado e instrução exata', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const invalidServiceArg = `unknown 5511999999999 ${'x'.repeat(90)}`;

        const result = await __testables.prepararAgendamentoTool(
            phone,
            'message-bad-service',
            {
                nomeCliente: 'Cliente Teste',
                servicoId: invalidServiceArg,
                dataHoraInicio: '2026-10-17T15:00:00-03:00',
            },
            ['Cliente Teste'],
        );

        expect(result).toMatchObject({
            sucesso: false,
            mensagem: 'Não encontrei esse serviço.',
            instrucao:
                'Chame buscarServicos e use o campo id retornado como servicoId.',
        });
        const entry = warn.mock.calls.find(([label]) =>
            String(label).includes('servico_nao_encontrado'),
        );
        expect(entry?.[1]).toMatchObject({
            servicoArgTipo: 'desconhecido',
            servicoArgComprimento: invalidServiceArg.length,
            servicoArg: invalidServiceArg
                .slice(0, 80)
                .replace(/\d+/g, '[mascarado]'),
        });
        expect(JSON.stringify(entry)).not.toContain('5511999999999');
        warn.mockRestore();
    });
});
