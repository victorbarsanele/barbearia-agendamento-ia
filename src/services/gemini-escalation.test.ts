import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    generateContent: vi.fn(),
    listarTodosAgendamentos: vi.fn(),
    buscarClientePorTelefone: vi.fn(),
    listarTodosClientes: vi.fn(),
    criarCliente: vi.fn(),
    listarTodosServicos: vi.fn(),
    atualizarAgendamento: vi.fn(),
    cancelarAgendamento: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: class MockGoogleGenAI {
        models = {
            generateContent: mocks.generateContent,
        };
    },
    FunctionCallingConfigMode: {
        AUTO: 'AUTO',
    },
}));

vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: mocks.listarTodosAgendamentos,
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: mocks.buscarClientePorTelefone,
    listarTodos: mocks.listarTodosClientes,
    criar: mocks.criarCliente,
}));

vi.mock('../repositories/servico.repository', () => ({
    listarTodos: mocks.listarTodosServicos,
}));

vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    MIN_ANTECEDENCIA_MS: 60 * 60 * 1000,
    atualizar: mocks.atualizarAgendamento,
    cancelar: mocks.cancelarAgendamento,
}));

const AGORA = new Date('2026-08-03T12:00:00Z');
const TELEFONE_CLIENTE = '5511999999999@s.whatsapp.net';
const NUMERO_CLIENTE = '5511999999999';
const NUMERO_BARBEIRO = '5511888888888';
const RESPOSTA_CONFUSA = 'Desculpe, não entendi. Pode repetir?';
const RESPOSTA_FAQ = 'O corte custa R$40.';
const MENSAGEM_ESCALONAMENTO =
    'Já avisei o barbeiro, ele já te responde por aqui em instantes.';

type GeminiModule = Awaited<typeof import('./gemini.service')>;

async function importGeminiModule(): Promise<GeminiModule> {
    return import('./gemini.service');
}

function getSentMessages() {
    const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

    return fetchMock.mock.calls.map(([, init]) => {
        const request = init as RequestInit;
        return JSON.parse(String(request.body)) as {
            number: string;
            text: string;
        };
    });
}

describe('gemini.service escalonamento humano', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(AGORA);

        process.env.GEMINI_API_KEY = 'gemini-test-key';
        process.env.EVOLUTION_API_KEY = 'evolution-test-key';
        delete process.env.ESCALATION_COOLDOWN_MS;
        delete process.env.BARBER_PHONE;

        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: vi.fn().mockResolvedValue(''),
        }) as typeof fetch;

        mocks.generateContent.mockResolvedValue({
            functionCalls: [],
            text: RESPOSTA_FAQ,
        });
        mocks.listarTodosAgendamentos.mockResolvedValue([]);
        mocks.buscarClientePorTelefone.mockResolvedValue(null);
        mocks.listarTodosClientes.mockResolvedValue([]);
        mocks.criarCliente.mockResolvedValue(null);
        mocks.listarTodosServicos.mockResolvedValue([]);
        mocks.atualizarAgendamento.mockResolvedValue(null);
        mocks.cancelarAgendamento.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete process.env.BARBER_PHONE;
        delete process.env.ESCALATION_COOLDOWN_MS;
        delete process.env.GEMINI_API_KEY;
        delete process.env.EVOLUTION_API_KEY;
    });

    it('envia mensagem de espera ao cliente e notifica barbeiro na primeira escalada', async () => {
        process.env.BARBER_PHONE = NUMERO_BARBEIRO;
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const gemini = await importGeminiModule();

        await gemini.__testables.escalarParaHumano(
            TELEFONE_CLIENTE,
            'palavra_chave',
        );

        expect(getSentMessages()).toEqual([
            {
                number: NUMERO_CLIENTE,
                text: MENSAGEM_ESCALONAMENTO,
            },
            {
                number: NUMERO_BARBEIRO,
                text: 'Cliente 5511999999999 precisa de atendimento manual (motivo: palavra_chave).',
            },
        ]);
    });

    it('não notifica barbeiro na segunda escalada seguida dentro do cooldown', async () => {
        process.env.BARBER_PHONE = NUMERO_BARBEIRO;
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const gemini = await importGeminiModule();

        await gemini.__testables.escalarParaHumano(
            TELEFONE_CLIENTE,
            'palavra_chave',
        );
        await gemini.__testables.escalarParaHumano(
            TELEFONE_CLIENTE,
            'sem_progresso',
        );

        const messages = getSentMessages();

        expect(
            messages.filter((message) => message.number === NUMERO_BARBEIRO),
        ).toHaveLength(1);
        expect(
            messages.filter((message) => message.number === NUMERO_CLIENTE),
        ).toHaveLength(2);
    });

    it('escala após 2 respostas consecutivas de confusão explícita', async () => {
        process.env.BARBER_PHONE = NUMERO_BARBEIRO;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        mocks.generateContent.mockResolvedValue({
            functionCalls: [],
            text: RESPOSTA_CONFUSA,
        });

        const gemini = await importGeminiModule();

        await gemini.processarMensagemWhatsapp(TELEFONE_CLIENTE, 'oi');
        await gemini.processarMensagemWhatsapp(TELEFONE_CLIENTE, 'não entendi');

        const messages = getSentMessages();
        const clienteMessages = messages.filter(
            (message) => message.number === NUMERO_CLIENTE,
        );
        const barbeiroMessages = messages.filter(
            (message) => message.number === NUMERO_BARBEIRO,
        );

        expect(mocks.generateContent).toHaveBeenCalledTimes(2);
        expect(clienteMessages).toEqual([
            {
                number: NUMERO_CLIENTE,
                text: RESPOSTA_CONFUSA,
            },
            {
                number: NUMERO_CLIENTE,
                text: MENSAGEM_ESCALONAMENTO,
            },
        ]);
        expect(barbeiroMessages).toEqual([
            {
                number: NUMERO_BARBEIRO,
                text: 'Cliente 5511999999999 precisa de atendimento manual (motivo: confusao_explicita).',
            },
        ]);
    });

    it('não escala com 4 turnos normais sem tool call', async () => {
        process.env.BARBER_PHONE = NUMERO_BARBEIRO;

        const gemini = await importGeminiModule();

        for (let i = 0; i < 4; i += 1) {
            await gemini.processarMensagemWhatsapp(
                TELEFONE_CLIENTE,
                `pergunta ${i}`,
            );
        }

        const messages = getSentMessages();

        expect(mocks.generateContent).toHaveBeenCalledTimes(4);
        expect(
            messages.filter((message) => message.number === NUMERO_BARBEIRO),
        ).toHaveLength(0);
        expect(
            messages.filter(
                (message) => message.text === MENSAGEM_ESCALONAMENTO,
            ),
        ).toHaveLength(0);
    });

    it('não escala com 3 turnos normais sem tool call', async () => {
        process.env.BARBER_PHONE = NUMERO_BARBEIRO;

        const gemini = await importGeminiModule();

        for (let i = 0; i < 3; i += 1) {
            await gemini.processarMensagemWhatsapp(
                TELEFONE_CLIENTE,
                `faq ${i}`,
            );
        }

        const messages = getSentMessages();

        expect(mocks.generateContent).toHaveBeenCalledTimes(3);
        expect(
            messages.filter((message) => message.number === NUMERO_BARBEIRO),
        ).toHaveLength(0);
        expect(messages).toHaveLength(3);
        expect(messages.every((message) => message.text === RESPOSTA_FAQ)).toBe(
            true,
        );
    });

    it('após cooldown expirar volta a chamar Gemini normalmente e reseta contadores', async () => {
        process.env.ESCALATION_COOLDOWN_MS = '60000';
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const gemini = await importGeminiModule();

        for (let i = 0; i < 4; i += 1) {
            await gemini.processarMensagemWhatsapp(
                TELEFONE_CLIENTE,
                `sem tool ${i}`,
            );
        }

        await gemini.__testables.escalarParaHumano(
            TELEFONE_CLIENTE,
            'palavra_chave',
        );

        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
        mocks.generateContent.mockClear();

        vi.advanceTimersByTime(60001);

        await gemini.processarMensagemWhatsapp(TELEFONE_CLIENTE, 'novo turno');

        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
        expect(getSentMessages()).toEqual([
            {
                number: NUMERO_CLIENTE,
                text: RESPOSTA_FAQ,
            },
        ]);
    });

    it('cooldown não é reiniciado por novas mensagens do cliente durante a espera', async () => {
        process.env.ESCALATION_COOLDOWN_MS = '60000';
        vi.spyOn(Math, 'random').mockReturnValue(0);

        const gemini = await importGeminiModule();

        await gemini.__testables.escalarParaHumano(
            TELEFONE_CLIENTE,
            'palavra_chave',
        );

        vi.advanceTimersByTime(30000);
        await gemini.processarMensagemWhatsapp(TELEFONE_CLIENTE, 'alguem ai?');

        vi.advanceTimersByTime(30001);

        (global.fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
        mocks.generateContent.mockClear();

        await gemini.processarMensagemWhatsapp(TELEFONE_CLIENTE, 'oi de novo');

        expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    });

    it('escala imediatamente para humano quando Gemini atinge limite de cota', async () => {
        process.env.BARBER_PHONE = NUMERO_BARBEIRO;
        vi.spyOn(Math, 'random').mockReturnValue(0);
        mocks.generateContent.mockRejectedValue({ status: 429 });

        const gemini = await importGeminiModule();

        const pending = gemini.processarMensagemWhatsapp(
            TELEFONE_CLIENTE,
            'quero agendar',
        );

        await vi.advanceTimersByTimeAsync(14000);
        await pending;

        const messages = getSentMessages();
        const barbeiroMessages = messages.filter(
            (m) => m.number === NUMERO_BARBEIRO,
        );

        expect(barbeiroMessages).toHaveLength(1);
        expect(barbeiroMessages[0].text).toContain('limite de uso da API');
    });
});
