import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    listarServicos: vi.fn(),
    buscarCliente: vi.fn(),
    listarClientes: vi.fn(),
    validarDisponibilidade: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        models = { generateContent: vi.fn() };
    },
    FunctionCallingConfigMode: { AUTO: 'AUTO' },
}));
vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
    buscarConflito: vi.fn().mockResolvedValue(null),
    criar: vi.fn(),
    isViolacaoDeSobreposicao: vi.fn().mockReturnValue(false),
}));
vi.mock('../repositories/bloqueio.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
    buscarConflito: vi.fn().mockResolvedValue(null),
}));
vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: mocks.buscarCliente,
    listarTodos: mocks.listarClientes,
    criar: vi.fn(),
    buscarPorId: vi.fn(),
}));
vi.mock('../repositories/pacote.repository', () => ({
    listarLiberadosParaGemini: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/pacoteCliente.repository', () => ({
    buscarPorId: vi.fn(),
}));
vi.mock('../repositories/servico.repository', () => ({
    listarTodos: mocks.listarServicos,
    buscarPorId: vi.fn(),
}));
vi.mock('../repositories/horarioFuncionamento.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/loteAgendamento.repository', () => ({}));
vi.mock('../repositories/escalation-state.repository', () => ({
    getEscalationStateRepository: () => ({
        obter: vi.fn().mockResolvedValue(null),
    }),
}));
vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    MIN_ANTECEDENCIA_MS: 60 * 60 * 1000,
    validarDisponibilidade: mocks.validarDisponibilidade,
    criar: vi.fn(),
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));

import { InMemoryPendingAgendamentoRepository } from '../repositories/pending-agendamento.repository';
import { __testables } from './gemini.service';

const phone = '5511999999999';
const service = {
    id: 'servico-valido',
    nome: 'Corte social, Degradê ou Tesoura',
    duracaoMinutos: 60,
    permiteExtensaoFechamento: false,
};

describe('resolver servicoId do Gemini', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listarServicos.mockResolvedValue([service]);
        mocks.buscarCliente.mockResolvedValue(null);
        mocks.listarClientes.mockResolvedValue([]);
        mocks.validarDisponibilidade.mockResolvedValue({
            dataHoraInicio: new Date('2026-10-17T18:00:00Z'),
            dataHoraFim: new Date('2026-10-17T19:00:00Z'),
        });
        __testables.setPendingAgendamentoRepository(
            new InMemoryPendingAgendamentoRepository(),
        );
    });

    it('aceita ID ou nome completo ignorando caixa, mas rejeita nomes parciais', async () => {
        const cases = [
            ['servico-valido', true],
            ['Corte social, Degradê ou Tesoura', true],
            ['corte social, degradê ou tesoura', true],
            ['Corte social', false],
            ['corte social', false],
        ] as const;

        const results = [];
        for (const [servicoId, esperado] of cases) {
            const result = await __testables.prepararAgendamentoTool(
                phone,
                `message-${results.length}`,
                {
                    nomeCliente: 'Cliente Teste',
                    servicoId,
                    dataHoraInicio: '2026-10-17T15:00:00-03:00',
                },
            );
            results.push(result.sucesso);
            expect(result.sucesso).toBe(esperado);
            if (!esperado) {
                expect(result.mensagem).toBe(
                    'Não encontrei esse serviço. Pode confirmar o nome exato?',
                );
            }
        }

        expect(results).toEqual([true, true, true, false, false]);
    });
});
