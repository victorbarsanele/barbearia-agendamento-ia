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
    getAudioConfig: vi.fn().mockReturnValue({}),
}));

import { EstadoEscalonamento } from '@prisma/client';
import { AppError } from '../lib/app-error';
import type { EscalationStateRepository } from '../repositories/escalation-state.repository';
import type {
    PendingAgendamento,
    PendingAgendamentoRepository,
} from '../repositories/pending-agendamento.repository';
import { RecentConfirmationStore } from './recent-confirmation.store';
import { ResumoEnviadoStore } from './resumo-enviado.store';
import { __testables, processarMensagemWhatsapp } from './gemini.service';

const phone = '5511999999999';
const messageId = 'message-current';
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
const preparationArgs = {
    nomeCliente: 'João Silva',
    servicoId: 'servico-1',
    dataHoraInicio: '2026-10-20T13:00:00-03:00',
};

class InMemoryPendingRepository implements PendingAgendamentoRepository {
    private readonly drafts = new Map<string, PendingAgendamento>();

    async salvar(
        draft: Omit<PendingAgendamento, 'criadoEm'> & {
            criadoEm?: Date;
        },
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
let resumoStore: ResumoEnviadoStore;
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

function seedDraft(id = 'message-created'): Promise<PendingAgendamento> {
    return pendingRepository.salvar({
        telefoneSessao: phone,
        ...draftValues,
        mensagemCriacaoId: id,
        expiraEm: new Date(Date.now() + 60_000),
    });
}

function seedConfirmation(id = 'message-confirmed'): void {
    confirmationStore.registrar(phone, {
        servicoNome: 'Corte',
        diaSemana: 'terça-feira',
        data: '20/10/2026',
        hora: '13:00',
        mensagemConfirmacaoId: id,
    });
}

function seedSummary(resumo = 'Resumo enviado literalmente'): void {
    resumoStore.registrar(phone, {
        mensagemCriacaoId: 'message-created',
        resumo,
    });
}

async function processTurnWithPreparation(
    finalText: (resumo: string) => string,
) {
    mocks.generateContent
        .mockResolvedValueOnce({
            functionCalls: [
                {
                    name: 'prepararAgendamento',
                    id: 'call-prepare',
                    args: preparationArgs,
                },
            ],
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                functionCall: {
                                    name: 'prepararAgendamento',
                                    args: preparationArgs,
                                },
                            },
                        ],
                    },
                },
            ],
        })
        .mockImplementationOnce(
            async (request: { contents: Array<Record<string, unknown>> }) => {
                const result = request.contents
                    .flatMap((content) =>
                        Array.isArray(content.parts) ? content.parts : [],
                    )
                    .map((part) => {
                        const response = (
                            part as {
                                functionResponse?: {
                                    response?: {
                                        result?: { resumo?: unknown };
                                    };
                                };
                            }
                        ).functionResponse;
                        return response?.response?.result?.resumo;
                    })
                    .find(
                        (value): value is string => typeof value === 'string',
                    );
                return { text: finalText(result ?? '') };
            },
        );

    await processarMensagemWhatsapp(phone, 'Quero agendar', messageId);
}

async function processTurnWithoutTools(text: string): Promise<void> {
    mocks.generateContent.mockResolvedValueOnce({ text });
    await processarMensagemWhatsapp(phone, 'Pode me explicar?', 'message-next');
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    currentTime = new Date('2026-10-15T12:00:00.000Z');
    pendingRepository = new InMemoryPendingRepository();
    resumoStore = new ResumoEnviadoStore({ now: () => currentTime });
    confirmationStore = new RecentConfirmationStore({
        now: () => currentTime,
    });
    __testables.setPendingAgendamentoRepository(pendingRepository);
    __testables.setResumoEnviadoStore(resumoStore);
    __testables.setRecentConfirmationStore(confirmationStore);
    __testables.setEscalationStateRepository(escalationRepository);
    __testables.limparMemoriaConversa(phone);

    mocks.findClient.mockResolvedValue({
        id: 'cliente-1',
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
        dataHoraInicio: new Date('2026-10-20T16:00:00.000Z'),
        dataHoraFim: new Date('2026-10-20T16:30:00.000Z'),
    });
    mocks.createBooking.mockResolvedValue(booking);
    mocks.sendWhatsAppText.mockResolvedValue(undefined);
    escalationRepository.obter = vi.fn().mockResolvedValue({
        estado: EstadoEscalonamento.BOT,
        escaladoEm: null,
    });
    escalationRepository.escalar = vi
        .fn()
        .mockResolvedValue({ novaEscalada: true, estado: {} });
    escalationRepository.reivindicarAviso = vi.fn().mockResolvedValue({
        reivindicado: false,
        reivindicadoEm: currentTime,
    });
    escalationRepository.registrarRespostaHumana = vi
        .fn()
        .mockResolvedValue({});
    escalationRepository.registrarRespostaHumanaIdempotente = vi
        .fn()
        .mockResolvedValue({ duplicado: false, estado: null });
});

afterEach(() => {
    vi.unstubAllEnvs();
    __testables.setPendingAgendamentoRepository(
        new InMemoryPendingRepository(),
    );
    __testables.setResumoEnviadoStore(new ResumoEnviadoStore());
    __testables.setRecentConfirmationStore(new RecentConfirmationStore());
    vi.useRealTimers();
});

describe('contrato de confirmarAgendamento', () => {
    it('sem rascunho retorna instrução e mensagem sem termos proibidos', async () => {
        const result = await __testables.confirmarAgendamentoTool(
            phone,
            messageId,
        );

        expect(result.mensagem).toBe(
            'Não encontrei um resumo pendente para confirmar.',
        );
        expect(result.mensagem).not.toMatch(/erro|problema|processamento/i);
        expect(result.instrucao).toBe(
            'Não diga que houve erro nem que vai refazer. Se a conversa já tem serviço, data/hora e nome, chame prepararAgendamento agora e envie o resumo retornado; caso contrário peça apenas os dados que faltam.',
        );
    });

    it('reconhece confirmação recente vinculada a outra mensagem', async () => {
        seedConfirmation('message-confirmed');

        await expect(
            __testables.confirmarAgendamentoTool(phone, messageId),
        ).resolves.toMatchObject({
            sucesso: true,
            jaConfirmado: true,
            mensagem:
                'Esse agendamento já está confirmado: Corte, terça-feira, 20/10/2026, 13:00.',
        });
        expect(mocks.createBooking).not.toHaveBeenCalled();
    });

    it('não retorna jaConfirmado para o mesmo messageId', async () => {
        seedConfirmation(messageId);

        const result = await __testables.confirmarAgendamentoTool(
            phone,
            messageId,
        );

        expect(result.sucesso).toBe(false);
        expect(result.jaConfirmado).toBeUndefined();
    });

    it('grava confirmação apenas após criação real', async () => {
        await seedDraft();

        await expect(
            __testables.confirmarAgendamentoTool(phone, messageId),
        ).resolves.toMatchObject({ sucesso: true, rascunhoRestaurado: false });
        expect(confirmationStore.obterValido(phone)).toMatchObject({
            servicoNome: 'Corte',
            data: '20/10/2026',
            hora: '13:00',
            mensagemConfirmacaoId: messageId,
        });
    });

    it.each([
        ['conflito', new Error('EXCLUSION_CONFLICT')],
        ['regra', new AppError('regra', 400)],
        ['erro inesperado', new Error('unexpected')],
    ])('%s não grava confirmação', async (_kind, error) => {
        await seedDraft();
        mocks.createBooking.mockRejectedValueOnce(error);

        const result = await __testables.confirmarAgendamentoTool(
            phone,
            messageId,
        );

        expect(result.sucesso).toBe(false);
        expect(confirmationStore.obterValido(phone)).toBeNull();
    });

    it('retorna rascunhoRestaurado conforme restauração após exceção', async () => {
        await seedDraft();
        mocks.createBooking.mockRejectedValueOnce(new Error('unexpected'));

        const restored = await __testables.confirmarAgendamentoTool(
            phone,
            messageId,
        );
        expect(restored.rascunhoRestaurado).toBe(true);

        await seedDraft();
        mocks.createBooking.mockImplementationOnce(async () => {
            await pendingRepository.salvar({
                telefoneSessao: phone,
                ...draftValues,
                mensagemCriacaoId: 'newer-draft',
                expiraEm: new Date(Date.now() + 60_000),
            });
            throw new Error('unexpected');
        });

        const notRestored = await __testables.confirmarAgendamentoTool(
            phone,
            'message-after-new-draft',
        );
        expect(notRestored.rascunhoRestaurado).toBe(false);
    });

    it('preparação bem-sucedida limpa confirmação anterior', async () => {
        seedConfirmation();

        await expect(
            __testables.prepararAgendamentoTool(
                phone,
                'message-prepared',
                preparationArgs,
                ['João Silva'],
            ),
        ).resolves.toMatchObject({ sucesso: true });
        expect(confirmationStore.obterValido(phone)).toBeNull();
    });
});

describe('limpeza central de estado de confirmação', () => {
    it('registra descarte por takeover sem dados pessoais', async () => {
        await seedDraft();
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        await __testables.registrarRespostaHumanaIdempotente(
            phone,
            'human-message',
            currentTime,
        );

        const eventCall = info.mock.calls.find(
            (call: unknown[]) =>
                call[0] === '[GEMINI SERVICE] rascunho_descartado_takeover',
        );
        expect(eventCall?.[1]).toEqual({
            evento: 'rascunho_descartado_takeover',
        });
        expect(JSON.stringify(eventCall)).not.toContain(phone);
        expect(JSON.stringify(eventCall)).not.toContain('João Silva');
        info.mockRestore();
    });

    it.each(['escalonamento', 'takeover comum', 'takeover idempotente'])(
        '%s limpa rascunho, resumo e confirmação',
        async (path) => {
            await seedDraft();
            seedSummary();
            seedConfirmation();

            if (path === 'escalonamento') {
                await __testables.escalarParaHumano(
                    phone,
                    'confusao_explicita',
                );
            } else if (path === 'takeover comum') {
                await __testables.registrarRespostaHumana(phone, currentTime);
            } else {
                await __testables.registrarRespostaHumanaIdempotente(
                    phone,
                    'human-message',
                    currentTime,
                );
            }

            expect(
                await pendingRepository.obterValido(phone, new Date()),
            ).toBeNull();
            expect(resumoStore.obterValido(phone)).toBeNull();
            expect(confirmationStore.obterValido(phone)).toBeNull();
        },
    );
});

describe('ciclo de vida do resumo enviado pelo backend', () => {
    it('registra resumo preparado quando resposta final o contém literalmente', async () => {
        await processTurnWithPreparation((resumo) => `Confira: ${resumo}`);

        expect(resumoStore.obterValido(phone)).toMatchObject({
            mensagemCriacaoId: messageId,
        });
    });

    it('mantém resumo preparado quando resposta final do Gemini não o contém', async () => {
        await processTurnWithPreparation(() => 'Seu horário está separado.');

        const resumo = resumoStore.obterValido(phone);
        expect(resumo).toMatchObject({ mensagemCriacaoId: messageId });
        expect(mocks.sendWhatsAppText).toHaveBeenCalledWith(
            phone,
            resumo?.resumo,
        );
    });

    it('renova resumo anterior quando turno sem preparação o repete literalmente', async () => {
        seedSummary();
        const previousTime = resumoStore.obterValido(phone)?.registradoEm;
        currentTime = new Date('2026-10-15T12:01:00.000Z');

        await processTurnWithoutTools(
            'Relembrando: Resumo enviado literalmente',
        );

        expect(resumoStore.obterValido(phone)?.registradoEm).not.toEqual(
            previousTime,
        );
        expect(resumoStore.obterValido(phone)?.registradoEm).toEqual(
            currentTime,
        );
    });

    it('limpa resumo anterior quando turno sem preparação não o repete', async () => {
        seedSummary();

        await processTurnWithoutTools('Posso ajudar com outra dúvida.');

        expect(resumoStore.obterValido(phone)).toBeNull();
    });
});

describe('regras do prompt de sistema', () => {
    it('instrui tratamento de falhas, linguagem e confirmação de resumo', () => {
        const prompt = __testables.buildSystemPrompt();

        expect(prompt).toContain(
            'Se confirmarAgendamento retornar sucesso=false com instrucao, siga instrucao; nos demais casos, repasse exatamente mensagem retornada pela tool.',
        );
        expect(prompt).toContain(
            'Nunca diga que houve erro, problema ou falha de processamento, a menos que a tool diga isso. Nunca prometa ação futura, como "um instante", "vou refazer" ou "vou verificar".',
        );
        expect(prompt).toContain(
            'Se o cliente confirmar ("sim", "pode", "isso") e houver na conversa um resumo recente enviado por você, chame confirmarAgendamento sem argumentos e NUNCA chame prepararAgendamento apenas porque o cliente confirmou.',
        );
    });

    it('inclui identidade e regras de nome quando configuração existe', () => {
        const prompt = __testables.buildSystemPrompt(undefined, {
            nome: 'Carlos Silva',
            nomesAceitos: ['Carlos Silva', 'Carlos', 'Cacá', 'Caca'],
        });

        expect(prompt).toContain(
            'O barbeiro responsável pelos atendimentos se chama Carlos Silva. Também atende por Carlos, Cacá, Caca.',
        );
        expect(prompt).toContain(
            'são dirigidas ao barbeiro e NUNCA indicam o nome do cliente.',
        );
        expect(prompt).toContain(
            'O nome do cliente só vale quando ele o informa explicitamente em resposta à pergunta de nome.',
        );
    });

    it('usa regra neutra sem identidade e mantém chamada compatível com um argumento', () => {
        const prompt = __testables.buildSystemPrompt(
            'CONTEXTO DE RASCUNHO',
            null,
        );

        expect(prompt).toContain(
            'Saudações e menções a nomes dirigidas à barbearia ou ao barbeiro nunca indicam o nome do cliente.',
        );
        expect(prompt).toContain('CONTEXTO DE RASCUNHO');
        expect(prompt).not.toMatch(/undefined|null|\{nome\}/u);
        expect(__testables.buildSystemPrompt('CONTEXTO DE RASCUNHO')).toContain(
            'CONTEXTO DE RASCUNHO',
        );
    });
});
