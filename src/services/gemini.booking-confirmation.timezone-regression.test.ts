import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/agendamento.repository', () => ({
    buscarConflito: vi.fn().mockResolvedValue(null),
    isViolacaoDeSobreposicao: vi.fn().mockReturnValue(false),
    criar: vi.fn().mockImplementation(async (data) => ({
        id: 'agendamento-1',
        ...data,
        status: 'AGENDADO',
        cliente: { nome: 'Cliente' },
        servico: { nome: 'Corte', duracaoMinutos: 60 },
    })),
}));
vi.mock('../repositories/bloqueio.repository', () => ({
    buscarConflito: vi.fn().mockResolvedValue(null),
}));
vi.mock('../repositories/cliente.repository', () => ({
    buscarPorId: vi.fn().mockResolvedValue({
        id: 'cliente-1',
        nome: 'Cliente',
        telefone: '5511999999999',
    }),
    buscarPorTelefone: vi.fn().mockResolvedValue(null),
    listarTodos: vi.fn().mockResolvedValue([]),
    criar: vi.fn().mockResolvedValue({
        id: 'cliente-1',
        nome: 'Cliente',
        telefone: '5511999999999',
    }),
}));
vi.mock('../repositories/horarioFuncionamento.repository', () => ({
    listarTodos: vi.fn().mockResolvedValue([
        {
            diaSemana: 6,
            horaAberturaMinutos: 480,
            horaFechamentoMinutos: 1020,
            almocoInicioMinutos: null,
            almocoFimMinutos: null,
            limiteExtensaoMinutos: null,
            ultimoInicioExtensaoMinutos: null,
        },
    ]),
}));
vi.mock('../repositories/pacoteCliente.repository', () => ({
    buscarPorId: vi.fn(),
}));
vi.mock('../repositories/pacote.repository', () => ({
    listarLiberadosParaGemini: vi.fn().mockResolvedValue([]),
}));
vi.mock('../repositories/loteAgendamento.repository', () => ({}));
vi.mock('../repositories/servico.repository', () => ({
    buscarPorId: vi.fn().mockResolvedValue({
        id: 'servico-1',
        nome: 'Corte',
        duracaoMinutos: 60,
        permiteExtensaoFechamento: false,
    }),
    listarTodos: vi.fn().mockResolvedValue([
        {
            id: 'servico-1',
            nome: 'Corte',
            duracaoMinutos: 60,
            permiteExtensaoFechamento: false,
        },
    ]),
}));
vi.mock('../repositories/escalation-state.repository', () => ({
    getEscalationStateRepository: () => ({
        obter: vi.fn().mockResolvedValue(null),
    }),
}));

import { InMemoryPendingAgendamentoRepository } from '../repositories/pending-agendamento.repository';
import { AppError } from '../lib/app-error';
import * as agendamentoService from './agendamento.service';
import { __testables } from './gemini.service';

describe('regressão de timezone na confirmação', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
        __testables.setPendingAgendamentoRepository(
            new InMemoryPendingAgendamentoRepository(),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('confirma 15:00 de Brasília sem alterar instante no argumento de criar', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        __testables.setPendingAgendamentoRepository(repository);
        const preparado = await __testables.prepararAgendamentoTool(
            '5511999999999',
            'prepare-1',
            {
                nomeCliente: 'João Silva',
                servicoId: 'servico-1',
                dataHoraInicio: '2026-10-24T15:00:00-03:00',
            },
            ['João Silva'],
        );
        expect(preparado.sucesso).toBe(true);

        const criar = vi
            .spyOn(agendamentoService, 'criar')
            .mockResolvedValue({
                id: 'agendamento-1',
                cliente: { nome: 'Cliente' },
                servico: { nome: 'Corte' },
                dataHoraInicio: new Date('2026-10-24T18:00:00.000Z'),
                status: 'AGENDADO',
            } as never);

        const confirmado = await __testables.confirmarAgendamentoTool(
            '5511999999999',
            'confirm-1',
        );

        expect(confirmado.sucesso).toBe(true);
        const dataHoraPassada = criar.mock.calls[0][0].dataHoraInicio;
        expect(dataHoraPassada).toBe('2026-10-24T15:00:00-03:00');
        expect(new Date(dataHoraPassada).toISOString()).toBe(
            '2026-10-24T18:00:00.000Z',
        );
    });

    it.each([
        ['08:00', true],
        ['15:00', true],
        ['16:00', true],
        ['17:00', false],
        ['18:00', false],
    ])(
        'validação real de funcionamento para sábado às %s (esperado: %s)',
        async (hora, permitido) => {
            const dataHora = `2026-10-24T${hora}:00-03:00`;
            const validation = agendamentoService.validarDisponibilidade(
                dataHora,
                60,
                false,
                false,
                'GEMINI',
                'cliente-1',
            );
            if (permitido) {
                await expect(validation).resolves.toBeDefined();
            } else {
                await expect(validation).rejects.toMatchObject({
                    statusCode: 422,
                });
            }
        },
    );

    it('formata resumo em Brasília para instante recebido em ISO UTC', async () => {
        const result = await __testables.prepararAgendamentoTool(
            '5511999999999',
            'prepare-utc',
            {
                nomeCliente: 'João Silva',
                servicoId: 'servico-1',
                dataHoraInicio: '2026-10-24T15:00:00Z',
            },
            ['João Silva'],
        );

        expect(result.resumo).toContain('24/10/2026, 15:00');
    });

    it('registra recusa de regra com status e mensagem sem sequências numéricas', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        __testables.setPendingAgendamentoRepository(repository);
        await __testables.prepararAgendamentoTool(
            '5511999999999',
            'prepare-rule',
            {
                nomeCliente: 'João Silva',
                servicoId: 'servico-1',
                dataHoraInicio: '2026-10-24T15:00:00-03:00',
            },
            ['João Silva'],
        );
        vi.spyOn(agendamentoService, 'criar').mockRejectedValue(
            new AppError('Falha para cliente 5511999999999 em 20261024.', 422),
        );
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await __testables.confirmarAgendamentoTool(
            '5511999999999',
            'confirm-rule',
        );

        expect(result.sucesso).toBe(false);
        expect(warning).toHaveBeenCalledOnce();
        expect(warning).toHaveBeenCalledWith(
            '[GEMINI TOOL] confirmarAgendamento recusado',
            expect.objectContaining({
                motivo: 'regra',
                status: 422,
                mensagem: 'Falha para cliente [mascarado] em [mascarado].',
            }),
        );
    });

    it('registra recusa sem messageId', async () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

        await __testables.confirmarAgendamentoTool('5511999999999', null);

        expect(warning).toHaveBeenCalledOnce();
        expect(warning).toHaveBeenCalledWith(
            '[GEMINI TOOL] confirmarAgendamento recusado',
            { tool: 'confirmarAgendamento', motivo: 'sem_message_id' },
        );
    });
});
