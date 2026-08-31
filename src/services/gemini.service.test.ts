import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: vi.fn(),
}));

vi.mock('../repositories/bloqueio.repository', () => ({
    listarTodos: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: vi.fn(),
    listarTodos: vi.fn(),
}));

vi.mock('../repositories/servico.repository', () => ({
    listarTodos: vi.fn(),
}));

vi.mock('./agendamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    MIN_ANTECEDENCIA_MS: 60 * 60 * 1000,
    criar: vi.fn(),
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
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
    pacoteClienteId: null,
    dataHoraInicio: new Date('2026-07-22T10:00:00-03:00'),
    dataHoraFim: new Date('2026-07-22T10:30:00-03:00'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
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
    vi.mocked(servicoRepository.listarTodos).mockResolvedValue([servicoBase]);
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe('gemini.service tools de reagendamento e cancelamento', () => {
    it('usa EVOLUTION_API_URL para o endpoint da Evolution API', async () => {
        vi.stubEnv('EVOLUTION_API_KEY', 'evolution-test-key');
        vi.stubEnv('EVOLUTION_API_URL', 'https://evolution.example.com');
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                text: vi.fn().mockResolvedValue(''),
            }),
        );

        vi.resetModules();
        const { sendWhatsAppText } = await import('./gemini.service');

        await sendWhatsAppText('5511999999999', 'Olá do teste');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://evolution.example.com/message/sendText/barbearia',
            expect.objectContaining({
                method: 'POST',
            }),
        );
    });

    it('releitura do ambiente em runtime para BARBER_PHONE e EVOLUTION_API_URL', async () => {
        vi.stubEnv('EVOLUTION_API_KEY', 'evolution-test-key');
        vi.stubEnv(
            'EVOLUTION_API_URL',
            'https://evolution.runtime.example.com',
        );
        vi.stubEnv('BARBER_PHONE', '5511888888888');
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                text: vi.fn().mockResolvedValue(''),
            }),
        );

        const { __testables } = await import('./gemini.service');

        await __testables.escalarParaHumano(
            '5511999999999@s.whatsapp.net',
            'palavra_chave',
        );

        expect(global.fetch).toHaveBeenLastCalledWith(
            'https://evolution.runtime.example.com/message/sendText/barbearia',
            expect.objectContaining({
                body: expect.stringContaining('5511888888888'),
            }),
        );
    });

    it('buscarHorariosDisponiveis nunca retorna horário que invade 11h30-12h00', async () => {
        vi.mocked(servicoRepository.listarTodos).mockResolvedValue([
            {
                id: 'servico-60min',
                nome: 'Corte e Barba',
                duracaoMinutos: 60,
                preco: null,
            },
        ]);
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([]);
        vi.mocked(bloqueioRepository.listarTodos).mockResolvedValue([]);

        const resultado = (await __testables.executeToolCall(
            {
                name: 'buscarHorariosDisponiveis',
                args: {
                    data: '2026-07-22',
                    servicoId: 'servico-60min',
                },
            } as any,
            '5511999999999',
            '5511999999999@s.whatsapp.net',
        )) as {
            data: string;
            horarios: string[];
            observacao?: string;
        };

        expect(resultado.observacao).toBeUndefined();
        expect(resultado.horarios).not.toContain('11:00');
        expect(resultado.horarios).not.toContain('11:30');
        expect(resultado.horarios).toContain('10:30');
        expect(resultado.horarios).toContain('12:00');
    });

    it('remove horários dentro de bloqueio e retorna motivo', async () => {
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([]);
        vi.mocked(bloqueioRepository.listarTodos).mockResolvedValue([
            {
                id: 'bloqueio-1',
                dataHoraInicio: new Date('2026-07-22T10:00:00-03:00'),
                dataHoraFim: new Date('2026-07-22T11:00:00-03:00'),
                motivo: 'Natal',
                createdAt: new Date('2026-07-20T00:00:00Z'),
            },
        ]);

        const resultado = (await __testables.executeToolCall(
            {
                name: 'buscarHorariosDisponiveis',
                args: { data: '2026-07-22', servicoId: 'servico-1' },
            } as any,
            '5511999999999',
            '5511999999999@s.whatsapp.net',
        )) as { horarios: string[]; bloqueios: Array<{ motivo: string }> };

        expect(resultado.horarios).not.toContain('10:00');
        expect(resultado.horarios).not.toContain('10:30');
        expect(resultado.horarios).toContain('09:00');
        expect(resultado.horarios).toContain('11:00');
        expect(resultado.bloqueios).toEqual([
            {
                inicio: '22/07/2026, 10:00',
                fim: '22/07/2026, 11:00',
                motivo: 'Natal',
            },
        ]);
    });

    it('mantém horário fora de bloqueio disponível', async () => {
        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([]);
        vi.mocked(bloqueioRepository.listarTodos).mockResolvedValue([
            {
                id: 'bloqueio-1',
                dataHoraInicio: new Date('2026-07-22T10:00:00-03:00'),
                dataHoraFim: new Date('2026-07-22T11:00:00-03:00'),
                motivo: 'Compromisso pessoal',
                createdAt: new Date('2026-07-20T00:00:00Z'),
            },
        ]);

        const resultado = (await __testables.executeToolCall(
            {
                name: 'buscarHorariosDisponiveis',
                args: { data: '2026-07-22', servicoId: 'servico-1' },
            } as any,
            '5511999999999',
            '5511999999999@s.whatsapp.net',
        )) as { horarios: string[] };

        expect(resultado.horarios).toContain('09:00');
        expect(resultado.horarios).toContain('11:00');
    });

    it('recupera agendamento quando Gemini envia nome do serviço em vez do id', async () => {
        vi.mocked(servicoRepository.listarTodos).mockResolvedValue([
            {
                id: 'corte-simples-id-real',
                nome: 'Corte Simples',
                duracaoMinutos: 30,
                preco: null,
            },
            {
                id: 'corte-e-barba-id-real',
                nome: 'Corte e Barba',
                duracaoMinutos: 60,
                preco: null,
            },
            {
                id: 'barba-id-real',
                nome: 'Barba',
                duracaoMinutos: 30,
                preco: null,
            },
        ]);

        vi.mocked(agendamentoService.criar).mockResolvedValue({
            ...agendamentoAtivoProximo,
            id: 'agendamento-criado-1',
            servicoId: 'corte-simples-id-real',
            servico: {
                ...servicoBase,
                id: 'corte-simples-id-real',
                nome: 'Corte Simples',
            },
        });

        const resultado = await __testables.criarAgendamentoTool({
            nomeCliente: 'João Silva',
            telefone: '5511999999999',
            servicoId: 'corte simples',
            dataHoraInicio: '2026-07-22T11:00:00',
        });

        expect(resultado).toMatchObject({
            sucesso: true,
            mensagem: 'Agendamento criado com sucesso.',
        });

        expect(agendamentoService.criar).toHaveBeenCalledWith(
            expect.objectContaining({
                servicoId: 'corte-simples-id-real',
            }),
        );

        expect(agendamentoService.criar).not.toHaveBeenCalledWith(
            expect.objectContaining({
                servicoId: 'corte simples',
            }),
        );
    });

    it('recusa educadamente sem expor id técnico quando serviço não existe de verdade', async () => {
        vi.mocked(servicoRepository.listarTodos).mockResolvedValue([
            {
                id: 'corte-simples-id-real',
                nome: 'Corte Simples',
                duracaoMinutos: 30,
                preco: null,
            },
            {
                id: 'corte-e-barba-id-real',
                nome: 'Corte e Barba',
                duracaoMinutos: 60,
                preco: null,
            },
            {
                id: 'barba-id-real',
                nome: 'Barba',
                duracaoMinutos: 30,
                preco: null,
            },
        ]);

        const resultado = await __testables.criarAgendamentoTool({
            nomeCliente: 'João Silva',
            telefone: '5511999999999',
            servicoId: 'Serviço Que Não Existe',
            dataHoraInicio: '2026-07-22T11:00:00',
        });

        expect(resultado).toMatchObject({
            sucesso: false,
            mensagem:
                'Não encontrei esse serviço. Pode confirmar o nome exato?',
        });

        expect(resultado.mensagem).not.toMatch(/c[a-z0-9]{20,}/i);
        expect(agendamentoService.criar).not.toHaveBeenCalled();
    });

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
            '5519989364548',
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
            '5519989364548',
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

    it('reagendamento mantém o serviço original quando servicoId não é informado', async () => {
        const agendamentoComServicoOriginal = {
            ...agendamentoAtivoProximo,
            servicoId: 'servico-1',
            servico: {
                ...servicoBase,
                id: 'servico-1',
                nome: 'Corte Simples',
            },
        };

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            agendamentoComServicoOriginal,
        ]);

        vi.mocked(agendamentoService.atualizar).mockResolvedValue({
            ...agendamentoComServicoOriginal,
            dataHoraInicio: new Date('2026-07-22T12:00:00-03:00'),
            dataHoraFim: new Date('2026-07-22T12:30:00-03:00'),
        });

        await __testables.atualizarAgendamentoTool(
            '5511999999999@s.whatsapp.net',
            { dataHoraInicio: '2026-07-22T12:00:00' },
        );

        expect(agendamentoService.atualizar).toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                servicoId: 'servico-1',
            }),
        );

        expect(agendamentoService.atualizar).not.toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                servicoId: undefined,
            }),
        );
    });

    it('reagendamento troca o serviço quando cliente pede por nome', async () => {
        const agendamentoComServicoOriginal = {
            ...agendamentoAtivoProximo,
            servicoId: 'servico-1',
            servico: {
                ...servicoBase,
                id: 'servico-1',
                nome: 'Corte Simples',
            },
        };

        vi.mocked(servicoRepository.listarTodos).mockResolvedValue([
            {
                id: 'servico-1',
                nome: 'Corte Simples',
                duracaoMinutos: 30,
                preco: null,
            },
            {
                id: 'servico-2',
                nome: 'Corte e Barba',
                duracaoMinutos: 60,
                preco: null,
            },
        ]);

        vi.mocked(agendamentoRepository.listarTodos).mockResolvedValue([
            agendamentoComServicoOriginal,
        ]);

        vi.mocked(agendamentoService.atualizar).mockResolvedValue({
            ...agendamentoComServicoOriginal,
            servicoId: 'servico-2',
            servico: {
                ...servicoBase,
                id: 'servico-2',
                nome: 'Corte e Barba',
            },
            dataHoraInicio: new Date('2026-07-22T13:00:00-03:00'),
            dataHoraFim: new Date('2026-07-22T14:00:00-03:00'),
        });

        const resultado = await __testables.atualizarAgendamentoTool(
            '5511999999999@s.whatsapp.net',
            {
                dataHoraInicio: '2026-07-22T13:00:00',
                servicoId: 'Corte e Barba',
            },
        );

        expect(resultado).toMatchObject({
            sucesso: true,
            mensagem: 'Agendamento reagendado com sucesso.',
        });

        expect(agendamentoService.atualizar).toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                servicoId: 'servico-2',
            }),
        );

        expect(agendamentoService.atualizar).not.toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                servicoId: 'servico-1',
            }),
        );

        expect(agendamentoService.atualizar).not.toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                servicoId: 'Corte e Barba',
            }),
        );
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
