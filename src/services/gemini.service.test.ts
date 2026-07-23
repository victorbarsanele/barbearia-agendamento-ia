import { StatusAgendamento } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: vi.fn(),
    listarTodos: vi.fn(),
}));

vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    MIN_ANTECEDENCIA_MS: 60 * 60 * 1000,
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as agendamentoService from './agendamento.service';
import { __testables } from './gemini.service';

const clienteBase = {
    id: 'cliente-1',
    nome: 'João Silva',
    telefone: '5511999999999',
    createdAt: new Date('2026-07-20T00:00:00Z'),
};

const servicoBase = {
    id: 'servico-1',
    nome: 'Corte masculino',
    duracaoMinutos: 30,
    preco: null,
};

const agendamentoAtivoProximo = {
    id: 'agendamento-1',
    clienteId: clienteBase.id,
    servicoId: servicoBase.id,
    dataHoraInicio: new Date('2026-07-22T10:00:00-03:00'),
    dataHoraFim: new Date('2026-07-22T10:30:00-03:00'),
    status: StatusAgendamento.AGENDADO,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    updatedAt: new Date('2026-07-20T00:00:00Z'),
    cliente: clienteBase,
    servico: servicoBase,
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));
    vi.clearAllMocks();
    vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(
        clienteBase,
    );
    vi.mocked(clienteRepository.listarTodos).mockResolvedValue([clienteBase]);
});

describe('gemini.service tools de reagendamento e cancelamento', () => {
    it('consulta prioriza telefone do contexto quando contexto já possui agendamento', async () => {
        vi.mocked(clienteRepository.buscarPorTelefone).mockImplementation(
            async (telefone: string) =>
                telefone === '5519989364548' || telefone === '19989364548'
                    ? {
                          ...clienteBase,
                          telefone: '19989364548',
                      }
                    : null,
        );

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            {
                ...agendamentoAtivoProximo,
                clienteId: clienteBase.id,
                dataHoraInicio: new Date('2026-07-24T11:00:00-03:00'),
                dataHoraFim: new Date('2026-07-24T11:30:00-03:00'),
            },
        ]);

        const resultado = await __testables.executeToolCall(
            {
                name: 'consultarAgendamento',
                args: { telefone: '00000000000' },
            } as any,
            '5519989364548@s.whatsapp.net',
        );

        expect(resultado).toMatchObject({
            telefone: '5519989364548',
            agendamentos: [
                {
                    id: 'agendamento-1',
                    status: StatusAgendamento.AGENDADO,
                },
            ],
        });
    });

    it('consulta ignora telefone informado quando contexto não possui agendamento', async () => {
        const clienteAlternativo = {
            ...clienteBase,
            id: 'cliente-2',
            telefone: '19999999999',
        };

        vi.mocked(clienteRepository.buscarPorTelefone).mockImplementation(
            async (telefone: string) => {
                if (
                    telefone === '5519989364548' ||
                    telefone === '19989364548'
                ) {
                    return {
                        ...clienteBase,
                        telefone: '19989364548',
                    };
                }

                if (
                    telefone === '19999999999' ||
                    telefone === '5519999999999'
                ) {
                    return clienteAlternativo;
                }

                return null;
            },
        );

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            {
                ...agendamentoAtivoProximo,
                id: 'agendamento-alt',
                clienteId: clienteAlternativo.id,
                dataHoraInicio: new Date('2026-07-30T09:00:00-03:00'),
                dataHoraFim: new Date('2026-07-30T09:30:00-03:00'),
            },
        ]);

        const resultado = await __testables.executeToolCall(
            {
                name: 'consultarAgendamento',
                args: { telefone: '19999999999' },
            } as any,
            '5519989364548@s.whatsapp.net',
        );

        expect(resultado).toMatchObject({
            telefone: '5519989364548',
            agendamentos: [],
            observacao: 'sem agendamento futuro ativo',
        });
    });

    it('consulta encontra cliente quando telefone salvo está sem prefixo 55', async () => {
        vi.mocked(clienteRepository.buscarPorTelefone).mockImplementation(
            async (telefone: string) =>
                telefone === '11999999999' ? clienteBase : null,
        );

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            {
                ...agendamentoAtivoProximo,
                dataHoraInicio: new Date('2026-07-24T11:00:00-03:00'),
                dataHoraFim: new Date('2026-07-24T11:30:00-03:00'),
            },
        ]);

        const resultado =
            await __testables.consultarAgendamentoTool('5511999999999');

        expect(clienteRepository.buscarPorTelefone).toHaveBeenCalledWith(
            '5511999999999',
        );
        expect(clienteRepository.buscarPorTelefone).toHaveBeenCalledWith(
            '11999999999',
        );
        expect(resultado.agendamentos).toHaveLength(1);
        expect(resultado.observacao).toBeUndefined();
    });

    it('consulta trata agendamento passado não cancelado como sem agendamento ativo', async () => {
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            {
                ...agendamentoAtivoProximo,
                id: 'agendamento-passado',
                dataHoraInicio: new Date('2026-07-20T09:00:00-03:00'),
                dataHoraFim: new Date('2026-07-20T09:30:00-03:00'),
                status: StatusAgendamento.AGENDADO,
            },
        ]);

        const resultado =
            await __testables.consultarAgendamentoTool('5511999999999');

        expect(resultado).toMatchObject({
            telefone: '5511999999999',
            agendamentos: [],
            observacao: 'sem agendamento futuro ativo',
        });
    });

    it('consulta encontra cliente quando telefone no banco está com máscara', async () => {
        vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(null);
        vi.mocked(clienteRepository.listarTodos).mockResolvedValue([
            {
                ...clienteBase,
                telefone: '(11) 99999-9999',
            },
        ]);

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            {
                ...agendamentoAtivoProximo,
                dataHoraInicio: new Date('2026-07-24T11:00:00-03:00'),
                dataHoraFim: new Date('2026-07-24T11:30:00-03:00'),
            },
        ]);

        const resultado =
            await __testables.consultarAgendamentoTool('5511999999999');

        expect(clienteRepository.listarTodos).toHaveBeenCalled();
        expect(resultado.agendamentos).toHaveLength(1);
    });

    it('reagendamento válido usa atualizar do serviço com validações existentes', async () => {
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            agendamentoAtivoProximo,
        ]);

        vi.mocked(agendamentoService.atualizar).mockResolvedValue({
            ...agendamentoAtivoProximo,
            dataHoraInicio: new Date('2026-07-22T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-22T11:30:00-03:00'),
        });

        const resultado = await __testables.atualizarAgendamentoTool(
            '5511999999999@s.whatsapp.net',
            { dataHoraInicio: '2026-07-22T11:00:00' },
        );

        expect(agendamentoService.atualizar).toHaveBeenCalledWith(
            'agendamento-1',
            {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-22T11:00:00-03:00',
                status: StatusAgendamento.AGENDADO,
            },
        );
        expect(resultado).toMatchObject({
            sucesso: true,
            mensagem: 'Agendamento reagendado com sucesso.',
        });
    });

    it('falha reagendamento quando serviço detecta conflito de horário', async () => {
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            agendamentoAtivoProximo,
        ]);

        vi.mocked(agendamentoService.atualizar).mockRejectedValue(
            new Error('Já existe um agendamento nesse horário.'),
        );

        const resultado = await __testables.atualizarAgendamentoTool(
            '5511999999999@s.whatsapp.net',
            { dataHoraInicio: '2026-07-22T11:00:00-03:00' },
        );

        expect(resultado).toMatchObject({
            sucesso: false,
            mensagem: 'Já existe um agendamento nesse horário.',
            motivoRecusa: 'Já existe um agendamento nesse horário.',
        });
    });

    it('cancelamento válido cancela agendamento ativo mais próximo', async () => {
        const agendamentoMaisTarde = {
            ...agendamentoAtivoProximo,
            id: 'agendamento-2',
            dataHoraInicio: new Date('2026-07-23T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-23T10:30:00-03:00'),
        };

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            agendamentoMaisTarde,
            agendamentoAtivoProximo,
        ]);

        vi.mocked(agendamentoService.cancelar).mockResolvedValue({
            ...agendamentoAtivoProximo,
            status: StatusAgendamento.CANCELADO,
        });

        const resultado = await __testables.cancelarAgendamentoTool(
            '5511999999999@s.whatsapp.net',
        );

        expect(agendamentoService.cancelar).toHaveBeenCalledWith(
            'agendamento-1',
        );
        expect(resultado).toMatchObject({
            sucesso: true,
            mensagem: 'Agendamento cancelado com sucesso.',
            agendamento: {
                id: 'agendamento-1',
                status: StatusAgendamento.CANCELADO,
            },
        });
    });

    it('falha ao agir quando telefone não possui agendamento ativo', async () => {
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([]);

        const resultadoReagendamento =
            await __testables.atualizarAgendamentoTool(
                '5511888888888@s.whatsapp.net',
                { dataHoraInicio: '2026-07-22T11:00:00-03:00' },
            );

        const resultadoCancelamento = await __testables.cancelarAgendamentoTool(
            '5511888888888@s.whatsapp.net',
        );

        expect(resultadoReagendamento).toMatchObject({
            sucesso: false,
            mensagem: 'Nenhum agendamento ativo encontrado para este telefone.',
        });
        expect(resultadoCancelamento).toMatchObject({
            sucesso: false,
            mensagem: 'Nenhum agendamento ativo encontrado para este telefone.',
        });
        expect(agendamentoService.atualizar).not.toHaveBeenCalled();
        expect(agendamentoService.cancelar).not.toHaveBeenCalled();
    });
});

describe('gemini.service retry 429', () => {
    it('aplica backoff exponencial com jitter e lança erro tratado após esgotar retries', async () => {
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const operation = vi
            .fn<() => Promise<never>>()
            .mockRejectedValue({ status: 429 });

        const pending = __testables.executeWith429Retry(operation);
        const rejectionAssertion = expect(pending).rejects.toMatchObject({
            name: 'GeminiRateLimitError',
            statusCode: 503,
            message:
                'Estou com alta demanda no momento, tente novamente em alguns instantes.',
        });

        await vi.advanceTimersByTimeAsync(2000);
        await vi.advanceTimersByTimeAsync(4000);
        await vi.advanceTimersByTimeAsync(8000);

        await rejectionAssertion;

        expect(operation).toHaveBeenCalledTimes(4);

        expect(warnSpy).toHaveBeenNthCalledWith(
            1,
            '[GEMINI API] Retry por rate limit (429)',
            expect.objectContaining({
                tentativaRetry: 1,
                esperaMs: 2000,
            }),
        );

        expect(warnSpy).toHaveBeenNthCalledWith(
            2,
            '[GEMINI API] Retry por rate limit (429)',
            expect.objectContaining({
                tentativaRetry: 2,
                esperaMs: 4000,
            }),
        );

        expect(warnSpy).toHaveBeenNthCalledWith(
            3,
            '[GEMINI API] Retry por rate limit (429)',
            expect.objectContaining({
                tentativaRetry: 3,
                esperaMs: 8000,
            }),
        );

        randomSpy.mockRestore();
        warnSpy.mockRestore();
    });

    it('não aplica retry para erro 400 não-rate-limit', async () => {
        const operation = vi
            .fn<() => Promise<never>>()
            .mockRejectedValue({ status: 400 });

        await expect(
            __testables.executeWith429Retry(operation),
        ).rejects.toEqual({ status: 400 });

        expect(operation).toHaveBeenCalledTimes(1);
    });
});
