import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusAgendamento } from '@prisma/client';

// --- Mocks dos repositórios: nenhuma chamada real ao banco neste teste. ---
vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: vi.fn(),
    listarTodos: vi.fn(),
    criar: vi.fn(),
}));

vi.mock('../repositories/servico.repository', () => ({
    listarTodos: vi.fn(),
}));

// agendamento.service só é usado por gemini_service.ts para TIME_ZONE e para
// atualizar()/cancelar() (não exercitados neste arquivo de teste).
vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import { __testables } from './gemini.service';

const { executeToolCall } = __testables;

// Sessão real do WhatsApp (verificada pela própria Evolution API/remoteJid).
const TELEFONE_SESSAO_REAL = '5519989364548';
// Telefone de OUTRO cliente, que o atacante apenas digitou no texto da conversa.
const TELEFONE_OUTRO_CLIENTE = '55199999999999'.slice(0, 13); // 5519999999999

const AGORA = new Date('2026-07-21T12:00:00Z');

const CLIENTE_SESSAO = {
    id: 'cliente-sessao-id',
    nome: 'Vinícius (sessão real)',
    telefone: TELEFONE_SESSAO_REAL,
    createdAt: AGORA,
};

const CLIENTE_ALVO = {
    id: 'cliente-alvo-id',
    nome: 'Cliente Alvo (outra pessoa)',
    telefone: TELEFONE_OUTRO_CLIENTE,
    createdAt: AGORA,
};

const SERVICO_ALVO = {
    id: 'servico-corte-barba',
    nome: 'Corte e Barba',
    duracaoMinutos: 60,
    preco: null,
};

function amanha(): Date {
    const d = new Date(AGORA);
    d.setDate(d.getDate() + 7);
    return d;
}

const AGENDAMENTO_DO_ALVO = {
    id: 'agendamento-alvo-id',
    clienteId: CLIENTE_ALVO.id,
    servicoId: SERVICO_ALVO.id,
    dataHoraInicio: amanha(),
    dataHoraFim: new Date(amanha().getTime() + 60 * 60 * 1000),
    status: StatusAgendamento.AGENDADO,
    createdAt: AGORA,
    updatedAt: AGORA,
    cliente: CLIENTE_ALVO,
    servico: SERVICO_ALVO,
};

describe('Regressão de segurança: consultarAgendamento não deve confiar em telefone informado no chat', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Repositório de clientes: só resolve pelo telefone real de sessão.
        (
            clienteRepository.buscarPorTelefone as ReturnType<typeof vi.fn>
        ).mockImplementation(async (telefone: string) => {
            if (telefone === TELEFONE_SESSAO_REAL) return CLIENTE_SESSAO;
            if (telefone === TELEFONE_OUTRO_CLIENTE) return CLIENTE_ALVO;
            return null;
        });

        (
            clienteRepository.listarTodos as ReturnType<typeof vi.fn>
        ).mockResolvedValue([CLIENTE_SESSAO, CLIENTE_ALVO]);

        // A sessão real não tem nenhum agendamento ativo (foi cancelado
        // anteriormente, como no cenário real reportado).
        (
            agendamentoRepository.listarTodos as ReturnType<typeof vi.fn>
        ).mockResolvedValue([AGENDAMENTO_DO_ALVO]);
    });

    it('NÃO deve retornar agendamento de outro cliente mesmo se o Gemini enviar um telefone diferente no argumento da tool', async () => {
        const resultado = (await executeToolCall(
            {
                name: 'consultarAgendamento',
                args: { telefone: TELEFONE_OUTRO_CLIENTE }, // valor "informado" no chat
                id: 'call-1',
            } as any,
            TELEFONE_SESSAO_REAL, // telefone real, vindo do remoteJid do WhatsApp
        )) as { agendamentos: unknown[] };

        expect(resultado.agendamentos).toHaveLength(0);
        expect(JSON.stringify(resultado)).not.toContain(CLIENTE_ALVO.nome);
        expect(JSON.stringify(resultado)).not.toContain('Corte e Barba');
    });

    it('deve continuar retornando os próprios agendamentos quando existirem, ignorando qualquer telefone informado', async () => {
        const agendamentoDaSessao = {
            ...AGENDAMENTO_DO_ALVO,
            id: 'agendamento-sessao-id',
            clienteId: CLIENTE_SESSAO.id,
            cliente: CLIENTE_SESSAO,
        };

        (
            agendamentoRepository.listarTodos as ReturnType<typeof vi.fn>
        ).mockResolvedValue([agendamentoDaSessao]);

        const resultado = (await executeToolCall(
            {
                name: 'consultarAgendamento',
                args: { telefone: TELEFONE_OUTRO_CLIENTE }, // tentativa de impersonar outro número
                id: 'call-2',
            } as any,
            TELEFONE_SESSAO_REAL,
        )) as { agendamentos: Array<{ id: string }> };

        expect(resultado.agendamentos).toHaveLength(1);
        expect(resultado.agendamentos[0].id).toBe('agendamento-sessao-id');
    });

    it('não deve permitir reagendar/cancelar o agendamento de outro cliente via telefoneContexto forjado', async () => {
        // Mesmo com a correção do fallback, este teste documenta e trava a
        // segunda camada de defesa: atualizarAgendamento/cancelarAgendamento
        // já usam apenas o telefone real da sessão (não recebem "telefone"
        // como argumento do Gemini). Aqui garantimos que buscar o
        // agendamento ativo pelo telefone da sessão real nunca resolve para
        // o cliente alvo, mesmo com os dois cadastrados no mock.
        const resultadoCancelamento = (await executeToolCall(
            { name: 'cancelarAgendamento', args: {}, id: 'call-3' } as any,
            TELEFONE_SESSAO_REAL,
        )) as { sucesso: boolean; mensagem: string };

        expect(resultadoCancelamento.sucesso).toBe(false);
        expect(resultadoCancelamento.mensagem).toContain(
            'Nenhum agendamento ativo encontrado',
        );
    });
});
