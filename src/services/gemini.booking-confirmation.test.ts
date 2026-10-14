import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    criar: vi.fn(),
    validarDisponibilidade: vi.fn(),
    buscarPorTelefone: vi.fn(),
    listarServicos: vi.fn(),
    listarHorarios: vi.fn(),
    obterEstado: vi.fn(),
    escalar: vi.fn(),
    reivindicarAviso: vi.fn(),
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
    buscarPorTelefone: mocks.buscarPorTelefone,
    listarTodos: vi.fn().mockResolvedValue([]),
    criar: vi.fn().mockResolvedValue({
        id: 'cliente-1',
        nome: 'Cliente',
        telefone: '5511999999999',
    }),
}));
vi.mock('../repositories/servico.repository', () => ({
    listarTodos: mocks.listarServicos,
}));
vi.mock('../repositories/horarioFuncionamento.repository', () => ({
    listarTodos: mocks.listarHorarios,
}));
vi.mock('../repositories/pacote.repository', () => ({
    listarLiberadosParaGemini: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/escalation-state.repository', () => ({
    getEscalationStateRepository: () => ({
        obter: mocks.obterEstado,
        escalar: mocks.escalar,
        reivindicarAviso: mocks.reivindicarAviso,
    }),
}));
vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    MIN_ANTECEDENCIA_MS: 60 * 60 * 1000,
    criar: mocks.criar,
    validarDisponibilidade: mocks.validarDisponibilidade,
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));

import { InMemoryPendingAgendamentoRepository } from '../repositories/pending-agendamento.repository';
import { EstadoEscalonamento } from '@prisma/client';
import { AppError } from '../lib/app-error';
import {
    __testables,
    escalarParaHumano,
} from './gemini.service';

const phone = '5511999999999';
const draft = {
    nomeCliente: 'Cliente',
    telefone: phone,
    servicoId: 'servico-1',
    dataHoraInicio: '2026-07-22T11:00:00',
};
const booking = {
    id: 'booking-1',
    cliente: { nome: 'Cliente' },
    servico: { nome: 'Corte' },
    dataHoraInicio: new Date('2026-07-22T14:00:00Z'),
    status: 'AGENDADO',
};

beforeEach(() => {
    vi.resetAllMocks();
    mocks.buscarPorTelefone.mockResolvedValue({
        id: 'cliente-1',
        nome: 'Cliente',
        telefone: phone,
    });
    mocks.listarServicos.mockResolvedValue([
        { id: 'servico-1', nome: 'Corte', duracaoMinutos: 30, permiteExtensaoFechamento: false },
    ]);
    mocks.listarHorarios.mockResolvedValue([]);
    mocks.validarDisponibilidade.mockResolvedValue({
        dataHoraInicio: new Date('2026-07-22T14:00:00Z'),
        dataHoraFim: new Date('2026-07-22T14:30:00Z'),
    });
    mocks.criar.mockResolvedValue(booking);
    mocks.obterEstado.mockResolvedValue({ estado: EstadoEscalonamento.BOT });
    mocks.escalar.mockResolvedValue({ novaEscalada: true });
    mocks.reivindicarAviso.mockResolvedValue({ reivindicado: false });
    __testables.setPendingAgendamentoRepository(
        new InMemoryPendingAgendamentoRepository(),
    );
});

async function prepare(messageId: string, values = draft) {
    return __testables.prepararAgendamentoTool(phone, messageId, values);
}

describe('confirmação de agendamento', () => {
    it('sem rascunho falha e não cria', async () => {
        const result = await __testables.confirmarAgendamentoTool(phone, 'm2');
        expect(result.sucesso).toBe(false);
        expect(mocks.criar).not.toHaveBeenCalled();
    });

    it('correção sobrescreve e confirma somente último rascunho', async () => {
        await prepare('m1');
        await prepare('m2', { ...draft, nomeCliente: 'Novo nome', telefone: '5511988888888' });
        await expect(__testables.confirmarAgendamentoTool(phone, 'm3')).resolves.toMatchObject({ sucesso: true });
        expect(mocks.criar).toHaveBeenCalledOnce();
        expect(mocks.criar.mock.calls[0][0]).toMatchObject({ clienteId: 'cliente-1' });
    });

    it('consome conflito e segunda confirmação não cria', async () => {
        mocks.criar.mockRejectedValueOnce(new Error('EXCLUSION_CONFLICT'));
        await prepare('m1');
        await expect(__testables.confirmarAgendamentoTool(phone, 'm2')).resolves.toMatchObject({
            mensagem: expect.stringContaining('reservado por outro cliente'),
        });
        await expect(__testables.confirmarAgendamentoTool(phone, 'm3')).resolves.toMatchObject({ sucesso: false });
        expect(mocks.criar).toHaveBeenCalledOnce();
    });

    it('não cria quando preparação detecta conflito do mesmo telefone', async () => {
        mocks.validarDisponibilidade.mockRejectedValueOnce(
            Object.assign(new Error('same conflict'), { isSameClientConflict: true }),
        );
        await expect(prepare('m1')).resolves.toMatchObject({ sucesso: false });
        expect(mocks.criar).not.toHaveBeenCalled();
    });

    it.each([EstadoEscalonamento.ESCALADO, EstadoEscalonamento.HUMANO_ATIVO])(
        'não confirma em estado %s',
        async (estado) => {
            mocks.obterEstado.mockResolvedValue({ estado });
            await prepare('m1');
            await __testables.confirmarAgendamentoTool(phone, 'm2');
            expect(mocks.criar).not.toHaveBeenCalled();
        },
    );

    it('restaura erro inesperado sem sobrescrever rascunho novo', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        mocks.criar.mockImplementationOnce(async () => {
            await repository.salvar({
                telefoneSessao: phone,
                nomeCliente: 'Novo',
                telefoneCliente: phone,
                servicoId: 'servico-1',
                dataHoraInicio: new Date('2026-07-22T14:00:00Z'),
                mensagemCriacaoId: 'm-new',
                expiraEm: new Date(Date.now() + 600000),
            });
            throw new Error('unexpected');
        });
        await prepare('m1');
        __testables.setPendingAgendamentoRepository(repository);
        await repository.salvar({
            telefoneSessao: phone,
            nomeCliente: 'Cliente',
            telefoneCliente: phone,
            servicoId: 'servico-1',
            dataHoraInicio: new Date('2026-07-22T14:00:00Z'),
            mensagemCriacaoId: 'm1',
            expiraEm: new Date(Date.now() + 600000),
        });
        await expect(__testables.confirmarAgendamentoTool(phone, 'm2')).resolves.toMatchObject({ sucesso: false });
        await expect(repository.consumir(phone, 'm4', new Date())).resolves.toMatchObject({ nomeCliente: 'Novo' });
    });

    it('erro de regra consome sem restaurar', async () => {
        mocks.criar.mockRejectedValueOnce(new AppError('rule', 400));
        await prepare('m1');
        await expect(__testables.confirmarAgendamentoTool(phone, 'm2')).resolves.toMatchObject({ sucesso: false });
        await expect(__testables.confirmarAgendamentoTool(phone, 'm3')).resolves.toMatchObject({ sucesso: false });
    });

    it('duas confirmações concorrentes criam no máximo uma vez', async () => {
        await prepare('m1');
        const results = await Promise.all([
            __testables.confirmarAgendamentoTool(phone, 'm2'),
            __testables.confirmarAgendamentoTool(phone, 'm3'),
        ]);
        expect(results.filter((result) => result.sucesso)).toHaveLength(1);
        expect(mocks.criar).toHaveBeenCalledOnce();
    });

    it('escalarParaHumano apaga rascunho', async () => {
        await prepare('m1');
        await escalarParaHumano(phone, 'confusao_explicita');
        await expect(__testables.confirmarAgendamentoTool(phone, 'm2')).resolves.toMatchObject({ sucesso: false });
    });
});
