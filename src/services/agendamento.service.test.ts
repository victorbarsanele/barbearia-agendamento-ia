import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const notificationMock = vi.hoisted(() => ({
    enviarNotificacaoWhatsApp: vi.fn(),
}));
const googleSyncMock = vi.hoisted(() => {
    const state = { idsEnfileirados: [] as string[] };
    return {
        state,
        enfileirarSincronizacao: vi.fn(async (ids: string[]) => {
            if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED === 'true') {
                state.idsEnfileirados.push(...ids);
            }
        }),
    };
});

vi.mock('../google-calendar/sync.service', () => googleSyncMock);

vi.mock('../repositories/agendamento.repository', () => ({
    criar: vi.fn(),
    criarComNumeroNoPacote: vi.fn(),
    criarComNumeroNoPacoteNaTransacao: vi.fn(),
    listarTodos: vi.fn(),
    buscarPorId: vi.fn(),
    buscarConflito: vi.fn(),
    atualizar: vi.fn(),
    cancelar: vi.fn(),
    concluirComPacote: vi.fn(),
    atualizarPacoteClienteId: vi.fn(),
    contarAtivosPorClienteId: vi.fn(),
    contarAtivosPorServicoId: vi.fn(),
    excluirCanceladosPorClienteId: vi.fn(),
    excluirCanceladosPorServicoId: vi.fn(),
    listarSiblingsEditaveisDoLote: vi.fn(),
    atualizarComNumeroNoPacote: vi.fn(),
    contarNaoCanceladosPorPacoteEServico: vi.fn(),
}));

vi.mock('../repositories/loteAgendamento.repository', () => ({
    criar: vi.fn(),
    buscarPorId: vi.fn(),
}));

vi.mock('../repositories/bloqueio.repository', () => ({
    buscarConflito: vi.fn(),
    buscarConflitoEmLista: vi.fn().mockReturnValue(null),
    listarTodos: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorId: vi.fn(),
    bloquearParaCriacaoDePacote: vi.fn(),
}));

vi.mock('../repositories/servico.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('../repositories/pacoteCliente.repository', () => ({
    buscarPorId: vi.fn(),
    buscarAtivoPorClienteId: vi.fn(),
    criarNaTransacao: vi.fn(),
    transacionar: vi.fn(),
}));

vi.mock('../repositories/horarioFuncionamento.repository', () => ({
    listarTodos: vi.fn(),
}));

vi.mock('./gemini.service', () => ({
    sendWhatsAppText: vi.fn(),
    addToHistory: vi.fn(),
}));

vi.mock('./whatsapp-notification.service', () => notificationMock);

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as loteAgendamentoRepository from '../repositories/loteAgendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import * as pacoteClienteRepository from '../repositories/pacoteCliente.repository';
import * as horarioFuncionamentoRepository from '../repositories/horarioFuncionamento.repository';
import { enfileirarSincronizacao } from '../google-calendar/sync.service';
import * as geminiService from './gemini.service';
import * as agendamentoService from './agendamento.service';

const clienteBase = {
    id: 'cliente-1',
    nome: 'João Silva',
    telefone: '11999999999',
    createdAt: new Date('2026-07-20T00:00:00Z'),
};

const servicoBase = {
    id: 'servico-1',
    nome: 'Corte masculino',
    duracaoMinutos: 30,
    preco: null,
    permiteExtensaoFechamento: false,
};

const agendamentoAtual = {
    id: 'agendamento-1',
    clienteId: clienteBase.id,
    servicoId: servicoBase.id,
    pacoteClienteId: null,
    loteId: null,
    dataHoraInicio: new Date('2026-07-20T09:00:00-03:00'),
    dataHoraFim: new Date('2026-07-20T09:30:00-03:00'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    updatedAt: new Date('2026-07-20T00:00:00Z'),
    cliente: clienteBase,
    servico: servicoBase,
};

const transacaoMock = {
    pacote: { findUnique: vi.fn() },
    agendamento: { count: vi.fn(), findFirst: vi.fn() },
    servico: { findUnique: vi.fn() },
};

function mockarDependenciasPadrao(
    almocoPorDia: Partial<Record<number, [number, number] | null>> = {},
) {
    vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(clienteBase);
    vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(servicoBase);
    vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue(null);
    vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue(null);
    vi.mocked(horarioFuncionamentoRepository.listarTodos).mockResolvedValue(
        [1, 2, 3, 4, 5]
            .map((diaSemana) => ({
                id: `horario-${diaSemana}`,
                diaSemana,
                horaAberturaMinutos: 540,
                horaFechamentoMinutos: 1200,
                almocoInicioMinutos:
                    almocoPorDia[diaSemana] === null
                        ? null
                        : (almocoPorDia[diaSemana]?.[0] ?? 690),
                almocoFimMinutos:
                    almocoPorDia[diaSemana] === null
                        ? null
                        : (almocoPorDia[diaSemana]?.[1] ?? 720),
                limiteExtensaoMinutos: [4, 5].includes(diaSemana) ? 1230 : null,
                ultimoInicioExtensaoMinutos: [4, 5].includes(diaSemana)
                    ? 1170
                    : null,
                updatedAt: new Date('2026-07-20T00:00:00Z'),
            }))
            .concat({
                id: 'horario-6',
                diaSemana: 6,
                horaAberturaMinutos: 480,
                horaFechamentoMinutos: 1020,
                almocoInicioMinutos: 690,
                almocoFimMinutos: 720,
                limiteExtensaoMinutos: null,
                ultimoInicioExtensaoMinutos: null,
                updatedAt: new Date('2026-07-20T00:00:00Z'),
            }),
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'));
    vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '60');
    vi.stubEnv('OFERTA_FOLGA_MINUTOS', '0');
    vi.clearAllMocks();
    googleSyncMock.state.idsEnfileirados.length = 0;
    notificationMock.enviarNotificacaoWhatsApp.mockResolvedValue(
        'Mensagem de notificação',
    );
    vi.mocked(enfileirarSincronizacao).mockImplementation(async (ids) => {
        if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED === 'true') {
            googleSyncMock.state.idsEnfileirados.push(...ids);
        }
        return { total: ids.length, falhas: 0 };
    });
    vi.mocked(clienteRepository.bloquearParaCriacaoDePacote).mockResolvedValue(
        true,
    );
    vi.mocked(pacoteClienteRepository.transacionar).mockImplementation(
        (operation) => operation(transacaoMock as never),
    );
    transacaoMock.agendamento.count.mockResolvedValue(0);
    transacaoMock.agendamento.findFirst.mockResolvedValue(null);
    transacaoMock.servico.findUnique.mockResolvedValue(servicoBase);
    vi.mocked(bloqueioRepository.listarTodos).mockResolvedValue([]);
    mockarDependenciasPadrao();
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
});

describe('agendamento.service.criar', () => {
    it('usa almoço configurado para dia específico', async () => {
        mockarDependenciasPadrao({ 5: [720, 780] });
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-24T11:30:00-03:00'),
            dataHoraFim: new Date('2026-07-24T12:00:00-03:00'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-24T11:30:00-03:00',
            }),
        ).resolves.toBeDefined();

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-24T12:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            message:
                'Agendamento não pode ocorrer no horário de almoço (12h00 às 13h00).',
            statusCode: 422,
        });
    });

    it('não bloqueia almoço quando dia não possui intervalo configurado', async () => {
        mockarDependenciasPadrao({ 5: null });
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-24T12:00:00-03:00'),
            dataHoraFim: new Date('2026-07-24T12:30:00-03:00'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-24T12:00:00-03:00',
            }),
        ).resolves.toBeDefined();
    });

    it('rejeita agendamento com conflito de horário no mesmo barbeiro', async () => {
        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue({
            ...agendamentoAtual,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Já existe um agendamento nesse horário.',
            statusCode: 409,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('aceita agendamento em horário livre sem conflito', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T10:30:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledWith({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteClienteId: null,
            dataHoraInicio: new Date('2026-07-20T13:00:00Z'),
            dataHoraFim: new Date('2026-07-20T13:30:00Z'),
            status: StatusAgendamento.AGENDADO,
        });
        expect(resultado).toMatchObject({
            status: StatusAgendamento.AGENDADO,
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
        });
    });

    it('permite agendamento manual além do horizonte do Gemini', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-08-21T13:00:00Z'),
            dataHoraFim: new Date('2026-08-21T13:30:00Z'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-08-21T10:00:00-03:00',
                origem: 'PAINEL',
            }),
        ).resolves.toMatchObject({
            dataHoraInicio: new Date('2026-08-21T13:00:00Z'),
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledOnce();
    });

    it('mantém criação persistida quando enfileiramento falha', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );
        vi.mocked(enfileirarSincronizacao).mockRejectedValueOnce(
            new Error('outbox unavailable'),
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).resolves.toEqual(agendamentoAtual);
    });

    it('aceita criação retroativa no passado quando horário está livre', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T09:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T09:30:00-03:00'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T09:00:00-03:00',
                registroRetroativo: true,
            }),
        ).resolves.toBeDefined();

        expect(agendamentoRepository.criar).toHaveBeenCalled();
    });

    it('rejeita criação quando horário colide com bloqueio', async () => {
        vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue({
            id: 'bloqueio-1',
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:00:00-03:00'),
            motivo: 'Consulta médica',
            escopo: 'TODOS',
            recorrencia: 'PONTUAL',
            diaSemana: null,
            horaInicioMinutos: null,
            horaFimMinutos: null,
            createdAt: new Date('2026-07-19T00:00:00Z'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T10:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: 'Horário bloqueado pelo barbeiro: Consulta médica.',
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita agendamento antes das 9h', async () => {
        vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T08:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento deve estar dentro do horário de funcionamento: segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento depois das 20h', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 30,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T20:15:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento deve estar dentro do horário de funcionamento: segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento em domingo', async () => {
        vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-19T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Barbearia funciona de segunda a sexta, das 9h às 20h, e sábado, das 8h às 17h (horário de Brasília).',
            statusCode: 422,
        });
    });

    it('aceita agendamento até 20h em dia útil', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 30,
        });
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T19:30:00-03:00',
            }),
        ).resolves.toBeDefined();
    });

    it('aceita quinta-feira às 19h30 para serviço elegível', async () => {
        const servicoElegivel = {
            ...servicoBase,
            duracaoMinutos: 60,
            permiteExtensaoFechamento: true,
        };
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(
            servicoElegivel,
        );
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-23T19:30:00-03:00',
            }),
        ).resolves.toBeDefined();
    });

    it('aceita sexta-feira às 19h30 para serviço elegível', async () => {
        const servicoElegivel = {
            ...servicoBase,
            duracaoMinutos: 60,
            permiteExtensaoFechamento: true,
        };
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(
            servicoElegivel,
        );
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-24T19:30:00-03:00',
            }),
        ).resolves.toBeDefined();
    });

    it('rejeita quinta-feira às 19h30 para serviço não elegível', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
            permiteExtensaoFechamento: false,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-23T19:30:00-03:00',
            }),
        ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('rejeita sexta-feira às 19h30 quando serviço elegível termina após extensão', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 90,
            permiteExtensaoFechamento: true,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-24T19:30:00-03:00',
            }),
        ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('rejeita sábado após 17h mesmo para serviço elegível', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
            permiteExtensaoFechamento: true,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-25T16:30:00-03:00',
            }),
        ).rejects.toMatchObject({ statusCode: 422 });
    });

    it('rejeita agendamento com antecedência menor que o mínimo permitido', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T09:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento deve ser feito com no mínimo 1 hora de antecedência.',
            statusCode: 422,
        });
    });

    it('aceita agendamento com antecedência exatamente no limite mínimo', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T10:30:00-03:00'),
            status: StatusAgendamento.AGENDADO,
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('com mínimo configurado em 15, rejeita antecedência de 14 minutos e 59 segundos', async () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T09:14:59-03:00',
            }),
        ).rejects.toMatchObject({
            message:
                'Agendamento deve ser feito com no mínimo 15 minutos de antecedência.',
            statusCode: 422,
        });
    });

    it('com mínimo configurado em 15, aceita antecedência exata de 15 minutos', async () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T09:15:00-03:00'),
            dataHoraFim: new Date('2026-07-20T09:45:00-03:00'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T09:15:00-03:00',
            }),
        ).resolves.toMatchObject({
            dataHoraInicio: new Date('2026-07-20T09:15:00-03:00'),
        });
    });

    it('usa override de antecedência apenas quando fornecido internamente', async () => {
        const data = {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T09:50:00-03:00',
        };
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T09:50:00-03:00'),
            dataHoraFim: new Date('2026-07-20T10:20:00-03:00'),
        });

        await expect(agendamentoService.criar(data)).rejects.toMatchObject({
            statusCode: 422,
        });
        await expect(
            agendamentoService.criar(data, { minAntecedenciaMinutos: 50 }),
        ).resolves.toMatchObject({
            dataHoraInicio: new Date('2026-07-20T09:50:00-03:00'),
        });
    });

    it.each([
        [60, '1 hora'],
        [120, '2 horas'],
        [15, '15 minutos'],
        [1, '1 minuto'],
    ])('formata antecedência %i como %s', (minutos, esperado) => {
        expect(agendamentoService.formatarAntecedenciaMinima(minutos)).toBe(
            esperado,
        );
    });

    it('rejeita agendamento que começa exatamente às 11:30', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento que começa às 11:00 com duração de 60 minutos', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento que começa às 11:45', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:45:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });
    });

    it('aceita agendamento que termina exatamente às 11:30', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('aceita agendamento que começa exatamente às 12:00', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T12:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T12:30:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T12:00:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('aceita agendamento normal fora da janela de almoço', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T12:30:00-03:00'),
            dataHoraFim: new Date('2026-07-20T13:00:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T12:30:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('retorna todos os motivos brandos e permite override no painel', async () => {
        vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue({
            id: 'bloqueio-1',
            dataHoraInicio: new Date('2026-07-20T08:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T09:00:00-03:00'),
            motivo: 'Compromisso',
            escopo: 'TODOS',
            recorrencia: 'PONTUAL',
            diaSemana: null,
            horaInicioMinutos: null,
            horaFimMinutos: null,
            createdAt: new Date('2026-07-19T00:00:00Z'),
        });
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T08:30:00-03:00',
                registroRetroativo: true,
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['fora_funcionamento', 'bloqueio_total'],
            },
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T08:30:00-03:00',
            registroRetroativo: true,
            permitirForaDoExpediente: true,
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('retorna almoço como motivo brando e aceita override', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['almoco'],
            },
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:30:00-03:00',
            permitirForaDoExpediente: true,
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('retorna dia fechado como motivo brando e aceita override', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-26T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['dia_fechado'],
            },
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-26T10:00:00-03:00',
            permitirForaDoExpediente: true,
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('permite override de bloqueio total, mas ignora bloqueio SO_PAINEL', async () => {
        vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue({
            id: 'bloqueio-1',
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:00:00-03:00'),
            motivo: 'Compromisso',
            escopo: 'TODOS',
            recorrencia: 'PONTUAL',
            diaSemana: null,
            horaInicioMinutos: null,
            horaFimMinutos: null,
            createdAt: new Date('2026-07-19T00:00:00Z'),
        });
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['bloqueio_total'],
            },
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
            permitirForaDoExpediente: true,
        });

        vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue({
            id: 'bloqueio-painel',
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:00:00-03:00'),
            motivo: 'Pausa interna',
            escopo: 'SO_PAINEL',
            recorrencia: 'PONTUAL',
            diaSemana: null,
            horaInicioMinutos: null,
            horaFimMinutos: null,
            createdAt: new Date('2026-07-19T00:00:00Z'),
        });
        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(bloqueioRepository.buscarConflito).toHaveBeenLastCalledWith(
            expect.any(Date),
            expect.any(Date),
            'PAINEL',
        );
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(2);
    });

    it('mantém conflito duro mesmo com override e rejeita cruzamento de dia', async () => {
        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue({
            ...agendamentoAtual,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T08:30:00-03:00',
                registroRetroativo: true,
                permitirForaDoExpediente: true,
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: 'Já existe um agendamento nesse horário.',
        });

        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue(null);
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T23:30:00-03:00',
                permitirForaDoExpediente: true,
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            message:
                'Agendamento deve começar e terminar no mesmo dia (horário de Brasília).',
        });
    });

    it('ignora override quando origem é Gemini', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-21T08:30:00-03:00',
                origem: 'GEMINI',
                permitirForaDoExpediente: true,
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['fora_funcionamento'],
            },
        });
        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('Gemini continua bloqueado por SO_PAINEL mesmo com override', async () => {
        vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue({
            id: 'bloqueio-painel',
            dataHoraInicio: new Date('2026-07-21T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-21T11:00:00-03:00'),
            motivo: 'Pausa interna',
            escopo: 'SO_PAINEL',
            recorrencia: 'PONTUAL',
            diaSemana: null,
            horaInicioMinutos: null,
            horaFimMinutos: null,
            createdAt: new Date('2026-07-19T00:00:00Z'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-21T10:00:00-03:00',
                origem: 'GEMINI',
                permitirForaDoExpediente: true,
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['bloqueio_so_painel'],
            },
        });
        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.cancelar', () => {
    it('altera status para CANCELADO sem deletar registro', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        const resultado = await agendamentoService.cancelar('agendamento-1');

        expect(agendamentoRepository.cancelar).toHaveBeenCalledWith(
            'agendamento-1',
        );
        expect(resultado.status).toBe(StatusAgendamento.CANCELADO);
        expect(resultado.id).toBe('agendamento-1');
    });

    it.each([
        ['por booleano', { concluido: true }],
        ['por status', { status: StatusAgendamento.CONCLUIDO }],
    ])('rejeita cancelamento concluído %s', async (_descricao, dados) => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            ...dados,
        });

        await expect(
            agendamentoService.cancelar('agendamento-1'),
        ).rejects.toMatchObject({
            message: 'Agendamento concluído não pode ser cancelado.',
            statusCode: 409,
        });
        expect(agendamentoRepository.cancelar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.atualizar', () => {
    it('reagenda no limite configurado de 15 minutos', async () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T09:15:00-03:00'),
            dataHoraFim: new Date('2026-07-20T09:45:00-03:00'),
        });

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T09:15:00-03:00',
                status: StatusAgendamento.AGENDADO,
            }),
        ).resolves.toMatchObject({
            dataHoraInicio: new Date('2026-07-20T09:15:00-03:00'),
        });
    });

    it.each([
        ['concluído por booleano', { concluido: true }],
        ['com status concluído', { status: StatusAgendamento.CONCLUIDO }],
    ])('rejeita PUT CANCELADO em agendamento %s', async (_descricao, dados) => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            ...dados,
        });

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:00:00-03:00',
                status: StatusAgendamento.CANCELADO,
            }),
        ).rejects.toMatchObject({
            message: 'Agendamento concluído não pode ser cancelado.',
            statusCode: 409,
        });
        expect(agendamentoRepository.atualizar).not.toHaveBeenCalled();
    });

    it.each([StatusAgendamento.AGENDADO, StatusAgendamento.CONFIRMADO])(
        'rejeita PUT CONCLUIDO vindo de %s',
        async (status) => {
            vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
                ...agendamentoAtual,
                status,
            });

            await expect(
                agendamentoService.atualizar('agendamento-1', {
                    clienteId: clienteBase.id,
                    servicoId: servicoBase.id,
                    dataHoraInicio: '2026-07-20T11:00:00-03:00',
                    status: StatusAgendamento.CONCLUIDO,
                }),
            ).rejects.toMatchObject({
                message:
                    'Para concluir um agendamento use a conclusão de pacote.',
                statusCode: 409,
            });
            expect(agendamentoRepository.atualizar).not.toHaveBeenCalled();
        },
    );

    it('permite PUT com status CONCLUIDO para remarcação', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CONCLUIDO,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CONCLUIDO,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:00:00-03:00',
                status: StatusAgendamento.CONCLUIDO,
            }),
        ).resolves.toMatchObject({ status: StatusAgendamento.CONCLUIDO });
        expect(agendamentoRepository.atualizar).toHaveBeenCalledTimes(1);
    });

    it('chama notificação quando reagendamento muda horário', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
            cliente: clienteBase,
            servico: servicoBase,
        });

        const resultado = await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: true,
        });

        expect(agendamentoRepository.atualizar).toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
                dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
                status: StatusAgendamento.AGENDADO,
            }),
        );
        expect(
            notificationMock.enviarNotificacaoWhatsApp,
        ).toHaveBeenCalledTimes(1);
        expect(notificationMock.enviarNotificacaoWhatsApp).toHaveBeenCalledWith(
            'reagendamento',
            clienteBase.telefone,
            expect.objectContaining({
                nomeCliente: clienteBase.nome,
                servico: servicoBase.nome,
            }),
        );
        expect(resultado.dataHoraInicio).toEqual(
            new Date('2026-07-20T11:00:00-03:00'),
        );
    });

    it('não chama notificação quando reagendamento não está marcado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });

        await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: false,
        });

        expect(
            notificationMock.enviarNotificacaoWhatsApp,
        ).not.toHaveBeenCalled();
    });

    it('não chama notificação quando reagendamento não muda horário nem serviço', async () => {
        vi.setSystemTime(new Date('2026-07-20T11:00:00Z'));
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
        });

        await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T09:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: true,
        });

        expect(
            notificationMock.enviarNotificacaoWhatsApp,
        ).not.toHaveBeenCalled();
    });

    it('mantém atualização quando envio de reagendamento falha', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });
        notificationMock.enviarNotificacaoWhatsApp.mockRejectedValueOnce(
            new Error('Evolution indisponível'),
        );

        const resultado = await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: true,
        });

        expect(agendamentoRepository.atualizar).toHaveBeenCalledTimes(1);
        expect(resultado.id).toBe('agendamento-1');
    });

    it('notifica cancelamento quando marcado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        await agendamentoService.cancelar('agendamento-1', true);

        expect(notificationMock.enviarNotificacaoWhatsApp).toHaveBeenCalledWith(
            'cancelamento',
            clienteBase.telefone,
            expect.objectContaining({
                nomeCliente: clienteBase.nome,
                servico: 'Corte masculino',
            }),
        );
        expect(geminiService.addToHistory).toHaveBeenCalledWith(
            clienteBase.telefone,
            'model',
            'Mensagem de notificação',
        );
    });

    it('não notifica cancelamento quando não marcado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        await agendamentoService.cancelar('agendamento-1', false);

        expect(
            notificationMock.enviarNotificacaoWhatsApp,
        ).not.toHaveBeenCalled();
    });

    it('mantém cancelamento quando envio de cancelamento falha', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });
        notificationMock.enviarNotificacaoWhatsApp.mockRejectedValueOnce(
            new Error('Evolution indisponível'),
        );

        const resultado = await agendamentoService.cancelar(
            'agendamento-1',
            true,
        );

        expect(agendamentoRepository.cancelar).toHaveBeenCalledWith(
            'agendamento-1',
        );
        expect(resultado.status).toBe(StatusAgendamento.CANCELADO);
    });

    it('rejeita reagendamento que sobrepõe horário de almoço', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
        });

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:00:00-03:00',
                status: StatusAgendamento.AGENDADO,
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });

        expect(agendamentoRepository.atualizar).not.toHaveBeenCalled();
    });

    it('não revalida antecedência ou regras brandas quando horário e serviço não mudam', async () => {
        const foraDoExpediente = {
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T08:30:00-03:00'),
            dataHoraFim: new Date('2026-07-20T09:00:00-03:00'),
        };
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(
            foraDoExpediente,
        );
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue(
            foraDoExpediente,
        );

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T08:30:00-03:00',
                status: StatusAgendamento.CONFIRMADO,
            }),
        ).resolves.toMatchObject({
            dataHoraInicio: new Date('2026-07-20T08:30:00-03:00'),
        });

        expect(
            horarioFuncionamentoRepository.listarTodos,
        ).not.toHaveBeenCalled();
        expect(bloqueioRepository.buscarConflito).not.toHaveBeenCalled();
        expect(agendamentoRepository.buscarConflito).not.toHaveBeenCalled();
    });

    it('exige override ao mover horário para fora do expediente', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(
            agendamentoAtual,
        );
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-21T08:30:00-03:00',
                status: StatusAgendamento.AGENDADO,
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['fora_funcionamento'],
            },
        });
        expect(agendamentoRepository.atualizar).not.toHaveBeenCalled();

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-21T08:30:00-03:00',
                status: StatusAgendamento.AGENDADO,
                permitirForaDoExpediente: true,
            }),
        ).resolves.toBeDefined();
        expect(agendamentoRepository.atualizar).toHaveBeenCalledTimes(1);
    });

    it('ignora override explícito quando reagendamento tem origem Gemini', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(
            agendamentoAtual,
        );

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-21T08:30:00-03:00',
                status: StatusAgendamento.AGENDADO,
                origem: 'GEMINI',
                permitirForaDoExpediente: true,
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            details: {
                code: 'FORA_DO_EXPEDIENTE',
                motivos: ['fora_funcionamento'],
            },
        });
        expect(agendamentoRepository.atualizar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.criar com pacoteClienteId', () => {
    it('rejeita quando pacoteCliente informado não existe', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não encontrado.',
            statusCode: 404,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita quando pacoteCliente não está ativo', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'FINALIZADO',
            servicos: [],
        } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não está ativo.',
            statusCode: 400,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita serviço esgotado mesmo com outro serviço ainda disponível', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            pacote: { servicos: [{ servicoId: servicoBase.id }] },
            servicos: [
                { servicoId: servicoBase.id, quantidadeRestante: 0 },
                { servicoId: 'outro-servico', quantidadeRestante: 2 },
            ],
        } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente está esgotado.',
            statusCode: 400,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('aceita quando pacoteCliente está ativo e com saldo', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            pacote: {
                servicos: [{ servicoId: servicoBase.id }],
            },
            servicos: [{ servicoId: servicoBase.id, quantidadeRestante: 2 }],
        } as never);
        vi.mocked(
            agendamentoRepository.criarComNumeroNoPacote,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteClienteId: 'pacote-cliente-1',
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(
            agendamentoRepository.criarComNumeroNoPacote,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ pacoteClienteId: 'pacote-cliente-1' }),
            'pacote-cliente-1',
            servicoBase.id,
        );
    });

    it('rejeita quando serviço não está incluso no pacote selecionado', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            pacote: {
                servicos: [{ servicoId: 'outro-servico' }],
            },
            servicos: [],
        } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Este serviço não está incluso no pacote selecionado.',
            statusCode: 400,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.criar com pacoteId', () => {
    const dataHoraInicio = '2026-07-24T10:00:00-03:00';

    beforeEach(() => {
        transacaoMock.pacote.findUnique.mockReset();
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue(null);
    });

    it('mantém criação sem pacote no caminho atual', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue(
            agendamentoAtual,
        );

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio,
            origem: 'PAINEL',
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledOnce();
        expect(pacoteClienteRepository.transacionar).not.toHaveBeenCalled();
    });

    it('cria pacote, saldo e agendamento dentro da transação', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue({
            id: 'pacote-1',
            servicos: [{ servicoId: servicoBase.id, quantidadeTotal: 3 }],
        });
        vi.mocked(pacoteClienteRepository.criarNaTransacao).mockResolvedValue({
            id: 'pacote-cliente-1',
        } as never);
        vi.mocked(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            numeroNoPacote: 1,
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteId: 'pacote-1',
            dataHoraInicio,
            origem: 'PAINEL',
        });

        expect(
            vi.mocked(clienteRepository.bloquearParaCriacaoDePacote).mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(pacoteClienteRepository.buscarAtivoPorClienteId).mock
                .invocationCallOrder[0],
        );
        expect(pacoteClienteRepository.criarNaTransacao).toHaveBeenCalledWith(
            transacaoMock,
            expect.objectContaining({
                clienteId: clienteBase.id,
                pacoteId: 'pacote-1',
                servicos: [
                    {
                        servicoId: servicoBase.id,
                        quantidadeTotal: 3,
                        usosAnteriores: 0,
                    },
                ],
            }),
        );
        expect(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).toHaveBeenCalledWith(
            transacaoMock,
            expect.objectContaining({
                pacoteClienteId: 'pacote-cliente-1',
            }),
            'pacote-cliente-1',
            servicoBase.id,
        );
    });

    it('reutiliza pacote ativo correspondente', async () => {
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue({
            id: 'pacote-cliente-1',
            pacoteId: 'pacote-1',
            status: 'ATIVO',
            pacote: {
                servicos: [
                    {
                        servicoId: servicoBase.id,
                        quantidadeTotal: 3,
                    },
                ],
            },
            servicos: [
                {
                    servicoId: servicoBase.id,
                    quantidadeRestante: 2,
                },
            ],
        } as never);
        vi.mocked(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteId: 'pacote-1',
            dataHoraInicio,
            origem: 'PAINEL',
        });

        expect(pacoteClienteRepository.criarNaTransacao).not.toHaveBeenCalled();
        expect(transacaoMock.pacote.findUnique).not.toHaveBeenCalled();
        expect(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).toHaveBeenCalledWith(
            transacaoMock,
            expect.objectContaining({ pacoteClienteId: 'pacote-cliente-1' }),
            'pacote-cliente-1',
            servicoBase.id,
        );
    });

    it('rejeita pacote solicitado diferente do ativo', async () => {
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue({ id: 'pc-1', pacoteId: 'pacote-2' } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteId: 'pacote-1',
                dataHoraInicio,
                origem: 'PAINEL',
            }),
        ).rejects.toMatchObject({ statusCode: 409 });

        expect(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).not.toHaveBeenCalled();
    });

    it('rejeita serviço ausente do pacote', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue({
            id: 'pacote-1',
            servicos: [],
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteId: 'pacote-1',
                dataHoraInicio,
                origem: 'PAINEL',
            }),
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita quantidade zero no serviço do catálogo', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue({
            id: 'pacote-1',
            servicos: [{ servicoId: servicoBase.id, quantidadeTotal: 0 }],
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteId: 'pacote-1',
                dataHoraInicio,
                origem: 'PAINEL',
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(pacoteClienteRepository.criarNaTransacao).not.toHaveBeenCalled();
    });

    it('rejeita pacoteId junto com pacoteClienteId', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteId: 'pacote-1',
                pacoteClienteId: 'pc-1',
                dataHoraInicio,
                origem: 'PAINEL',
            }),
        ).rejects.toMatchObject({ statusCode: 400 });

        expect(pacoteClienteRepository.transacionar).not.toHaveBeenCalled();
    });

    it('rejeita pacote do catálogo fora da origem PAINEL', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteId: 'pacote-1',
                dataHoraInicio,
                origem: 'GEMINI',
            }),
        ).rejects.toMatchObject({ statusCode: 403 });

        expect(pacoteClienteRepository.transacionar).not.toHaveBeenCalled();
    });

    it('rejeita pacoteClienteId para origem GEMINI', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pc-1',
                dataHoraInicio,
                origem: 'GEMINI',
            }),
        ).rejects.toMatchObject({ statusCode: 403 });

        expect(
            agendamentoRepository.criarComNumeroNoPacote,
        ).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.concluir', () => {
    it('rejeita quando agendamento não existe', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            agendamentoService.concluir('agendamento-inexistente'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não encontrado.',
            statusCode: 404,
        });
    });

    it('rejeita conclusão de agendamento cancelado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            message: 'Agendamento cancelado não pode ser concluído.',
            statusCode: 409,
        });
        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });

    it('rejeita quando agendamento não está vinculado a pacote', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: null,
        });

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não vinculado a pacote.',
            statusCode: 400,
        });

        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });

    it('rejeita idempotentemente quando agendamento já está concluído (não decrementa de novo)', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: true,
        });

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento já está concluído.',
            statusCode: 409,
        });

        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });

    it('conclui agendamento vinculado a pacote e decrementa quantidadeRestante', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: false,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(agendamentoRepository.concluirComPacote).mockResolvedValue({
            agendamento: {
                ...agendamentoAtual,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: {
                id: 'pacote-cliente-1',
                status: 'ATIVO',
            } as never,
        });

        const resultado = await agendamentoService.concluir('agendamento-1');

        expect(agendamentoRepository.concluirComPacote).toHaveBeenCalledWith(
            'agendamento-1',
            'pacote-cliente-1',
            servicoBase.id,
        );
        expect(resultado).toMatchObject({ concluido: true });
    });

    it('enfileira id após repository concluir com sucesso', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(agendamentoRepository.concluirComPacote).mockResolvedValue({
            agendamento: {
                ...agendamentoAtual,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: { id: 'pacote-cliente-1', status: 'ATIVO' } as never,
        });

        await agendamentoService.concluir('agendamento-1');

        expect(googleSyncMock.state.idsEnfileirados).toEqual(['agendamento-1']);
        expect(enfileirarSincronizacao).toHaveBeenCalledWith(['agendamento-1']);
        expect(
            googleSyncMock.enfileirarSincronizacao.mock.invocationCallOrder[0],
        ).toBeGreaterThan(
            vi.mocked(agendamentoRepository.concluirComPacote).mock
                .invocationCallOrder[0],
        );
    });

    it('enfileira somente conclusão principal e irmãos concluídos', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            loteId: 'lote-1',
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(
            agendamentoRepository.listarSiblingsEditaveisDoLote,
        ).mockResolvedValue([
            { id: 'irmao-concluido' },
            { id: 'irmao-falhou' },
        ] as never);
        const resultadoRepository = (id: string) => ({
            agendamento: {
                ...agendamentoAtual,
                id,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: { id: 'pacote-cliente-1', status: 'ATIVO' } as never,
        });
        vi.mocked(agendamentoRepository.concluirComPacote)
            .mockResolvedValueOnce(resultadoRepository('agendamento-1'))
            .mockResolvedValueOnce(resultadoRepository('irmao-concluido'))
            .mockRejectedValueOnce(new Error('repository failure'));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await agendamentoService.concluir('agendamento-1', true);

        expect(googleSyncMock.state.idsEnfileirados).toEqual([
            'agendamento-1',
            'irmao-concluido',
        ]);
        expect(enfileirarSincronizacao).toHaveBeenCalledWith([
            'agendamento-1',
            'irmao-concluido',
        ]);
    });

    it('não falha conclusão quando enfileiramento rejeita', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(agendamentoRepository.concluirComPacote).mockResolvedValue({
            agendamento: {
                ...agendamentoAtual,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: { id: 'pacote-cliente-1', status: 'ATIVO' } as never,
        });
        vi.mocked(enfileirarSincronizacao).mockRejectedValueOnce(
            new Error('outbox unavailable'),
        );

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).resolves.toMatchObject({ concluido: true });
    });

    it('não enfileira conclusão com flag desligada', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'false');
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(agendamentoRepository.concluirComPacote).mockResolvedValue({
            agendamento: {
                ...agendamentoAtual,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: { id: 'pacote-cliente-1', status: 'ATIVO' } as never,
        });

        await agendamentoService.concluir('agendamento-1');

        expect(googleSyncMock.state.idsEnfileirados).toEqual([]);
    });

    it('permite reparar status CONCLUIDO ainda não marcado como concluído', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CONCLUIDO,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: false,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(agendamentoRepository.concluirComPacote).mockResolvedValue({
            agendamento: {
                ...agendamentoAtual,
                status: StatusAgendamento.CONCLUIDO,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: { id: 'pacote-cliente-1', status: 'ATIVO' } as never,
        });

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).resolves.toMatchObject({ concluido: true });
        expect(agendamentoRepository.concluirComPacote).toHaveBeenCalledTimes(
            1,
        );
    });

    it('rejeita conclusão quando o pacote do cliente não está ativo (ex: cancelado)', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: false,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'CANCELADO',
        } as never);

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Não é possível concluir: pacote do cliente não está ativo.',
            statusCode: 409,
        });

        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.vincularPacote', () => {
    const pacoteClienteAtivo = {
        id: 'pacote-cliente-1',
        clienteId: clienteBase.id,
        status: 'ATIVO',
        pacote: {
            servicos: [{ servicoId: servicoBase.id }],
        },
        servicos: [{ servicoId: servicoBase.id, quantidadeRestante: 5 }],
    };

    it('vincula pacote a agendamento existente sem vínculo prévio', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: null,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue(
            pacoteClienteAtivo as never,
        );
        vi.mocked(
            agendamentoRepository.atualizarPacoteClienteId,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });

        const resultado = await agendamentoService.vincularPacote(
            'agendamento-1',
            'pacote-cliente-1',
        );

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).toHaveBeenCalledWith('agendamento-1', 'pacote-cliente-1');
        expect(resultado.pacoteClienteId).toBe('pacote-cliente-1');
    });

    it('troca vínculo existente diretamente, sem exigir desvincular antes', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-antigo',
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue(
            pacoteClienteAtivo as never,
        );
        vi.mocked(
            agendamentoRepository.atualizarPacoteClienteId,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });

        await agendamentoService.vincularPacote(
            'agendamento-1',
            'pacote-cliente-1',
        );

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).toHaveBeenCalledWith('agendamento-1', 'pacote-cliente-1');
    });

    it('rejeita quando agendamento não existe', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            agendamentoService.vincularPacote(
                'agendamento-inexistente',
                'pacote-cliente-1',
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não encontrado.',
            statusCode: 404,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando agendamento está concluído', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CONCLUIDO,
            concluido: true,
        });

        await expect(
            agendamentoService.vincularPacote(
                'agendamento-1',
                'pacote-cliente-1',
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Não é possível alterar vínculo de pacote em agendamento concluído ou cancelado.',
            statusCode: 409,
        });

        expect(pacoteClienteRepository.buscarPorId).not.toHaveBeenCalled();
        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando agendamento está cancelado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        await expect(
            agendamentoService.vincularPacote(
                'agendamento-1',
                'pacote-cliente-1',
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            statusCode: 409,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando serviço do agendamento não está incluso no pacote', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            ...pacoteClienteAtivo,
            pacote: { servicos: [{ servicoId: 'outro-servico' }] },
        } as never);

        await expect(
            agendamentoService.vincularPacote(
                'agendamento-1',
                'pacote-cliente-1',
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Este serviço não está incluso no pacote selecionado.',
            statusCode: 400,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando pacote pertence a outro cliente', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            ...pacoteClienteAtivo,
            clienteId: 'outro-cliente',
        } as never);

        await expect(
            agendamentoService.vincularPacote(
                'agendamento-1',
                'pacote-cliente-1',
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote não pertence ao cliente do agendamento.',
            statusCode: 400,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.desvincularPacote', () => {
    it('desvincula pacote do agendamento sem afetar o pacote do cliente', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });
        vi.mocked(
            agendamentoRepository.atualizarPacoteClienteId,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: null,
        });

        const resultado =
            await agendamentoService.desvincularPacote('agendamento-1');

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).toHaveBeenCalledWith('agendamento-1', null);
        expect(resultado.pacoteClienteId).toBeNull();
    });

    it('rejeita quando agendamento não existe', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            agendamentoService.desvincularPacote('agendamento-inexistente'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não encontrado.',
            statusCode: 404,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando agendamento não tem vínculo de pacote', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: null,
        });

        await expect(
            agendamentoService.desvincularPacote('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não está vinculado a pacote.',
            statusCode: 400,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando agendamento está concluído', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            status: StatusAgendamento.CONCLUIDO,
            concluido: true,
        });

        await expect(
            agendamentoService.desvincularPacote('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            statusCode: 409,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });

    it('rejeita quando agendamento está cancelado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            status: StatusAgendamento.CANCELADO,
        });

        await expect(
            agendamentoService.desvincularPacote('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            statusCode: 409,
        });

        expect(
            agendamentoRepository.atualizarPacoteClienteId,
        ).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.criarLote', () => {
    const loteBase = {
        id: 'lote-1',
        clienteId: clienteBase.id,
        servicoId: servicoBase.id,
        pacoteClienteId: null,
        criadoEm: new Date('2026-07-20T00:00:00Z'),
        cliente: clienteBase,
        servico: servicoBase,
    };

    it('usa o mínimo configurado ao criar lote comum', async () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue(
            loteBase as never,
        );
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T09:15:00-03:00'),
            dataHoraFim: new Date('2026-07-20T09:45:00-03:00'),
        } as never);

        const resultado = await agendamentoService.criarLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            slots: [{ data: '2026-07-20', horario: '09:15' }],
        });

        expect(resultado.criados).toHaveLength(1);
        expect(resultado.falhados).toEqual([]);
    });

    it('cria parcialmente quando há conflito no meio do lote', async () => {
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue(
            loteBase as never,
        );

        // 1º slot livre, 2º slot com conflito, 3º slot livre novamente
        vi.mocked(agendamentoRepository.buscarConflito)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ ...agendamentoAtual } as never)
            .mockResolvedValueOnce(null);

        vi.mocked(agendamentoRepository.criar).mockImplementation(
            async (data) =>
                ({
                    ...agendamentoAtual,
                    id: `agendamento-${data.dataHoraInicio.toISOString()}`,
                    dataHoraInicio: data.dataHoraInicio,
                    dataHoraFim: data.dataHoraFim,
                    loteId: data.loteId ?? null,
                }) as never,
        );

        const resultado = await agendamentoService.criarLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            slots: [
                { data: '2026-07-21', horario: '10:00' },
                { data: '2026-07-21', horario: '11:00' },
                { data: '2026-07-21', horario: '12:30' },
            ],
        });

        expect(resultado.loteId).toBe('lote-1');
        expect(resultado.criados).toHaveLength(2);
        expect(resultado.falhados).toHaveLength(1);
        expect(resultado.falhados[0]).toMatchObject({
            data: '2026-07-21',
            horario: '11:00',
            motivo: 'Já existe um agendamento nesse horário.',
        });
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(2);
    });

    it('revalida disponibilidade no momento da inserção (corrida com a simulação)', async () => {
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue(
            loteBase as never,
        );

        // Simulação (que não é chamada aqui) teria dado livre, mas na
        // inserção outro processo já ocupou o horário nesse meio-tempo.
        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValueOnce({
            ...agendamentoAtual,
        } as never);

        const resultado = await agendamentoService.criarLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            slots: [{ data: '2026-07-21', horario: '10:00' }],
        });

        expect(resultado.criados).toHaveLength(0);
        expect(resultado.falhados).toHaveLength(1);
        expect(resultado.falhados[0].motivo).toBe(
            'Já existe um agendamento nesse horário.',
        );
        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('preserva criação parcial com pacoteClienteId existente', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            pacote: { servicos: [{ servicoId: servicoBase.id }] },
            servicos: [
                {
                    servicoId: servicoBase.id,
                    quantidadeTotal: 3,
                    usosAnteriores: 0,
                    quantidadeRestante: 3,
                },
            ],
        } as never);
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue({
            ...loteBase,
            pacoteClienteId: 'pacote-cliente-1',
        } as never);
        vi.mocked(
            agendamentoRepository.criarComNumeroNoPacote,
        ).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        } as never);

        const resultado = await agendamentoService.criarLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteClienteId: 'pacote-cliente-1',
            slots: [
                { data: '2026-07-21', horario: '10:00' },
                { data: '2026-07-21', horario: '11:00' },
            ],
        });

        expect(resultado.criados).toHaveLength(2);
        expect(resultado.falhados).toEqual([]);
        expect(
            agendamentoRepository.criarComNumeroNoPacote,
        ).toHaveBeenCalledTimes(2);
        expect(pacoteClienteRepository.transacionar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.simularLote', () => {
    it('usa o mínimo configurado ao simular lote', async () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');

        const resultado = await agendamentoService.simularLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            slots: [{ data: '2026-07-20', horario: '09:15' }],
        });

        expect(resultado.disponiveis).toEqual([
            { data: '2026-07-20', horario: '09:15' },
        ]);
        expect(resultado.conflitos).toEqual([]);
    });

    it('transforma slots além das vagas do pacote em conflitos', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            pacote: { servicos: [{ servicoId: servicoBase.id }] },
            servicos: [
                {
                    servicoId: servicoBase.id,
                    quantidadeTotal: 4,
                    usosAnteriores: 1,
                    quantidadeRestante: 3,
                },
            ],
        } as never);
        vi.mocked(
            agendamentoRepository.contarNaoCanceladosPorPacoteEServico,
        ).mockResolvedValue(2);

        const resultado = await agendamentoService.simularLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteClienteId: 'pacote-cliente-1',
            slots: [
                { data: '2026-07-21', horario: '10:00' },
                { data: '2026-07-21', horario: '11:00' },
            ],
        });

        expect(resultado.disponiveis).toHaveLength(1);
        expect(resultado.conflitos).toMatchObject([
            {
                data: '2026-07-21',
                horario: '11:00',
                motivo: 'Todos os 3 usos restantes deste serviço no pacote já estão agendados ou concluídos.',
            },
        ]);
    });

    it('retorna slots disponíveis e conflitos sem persistir nada', async () => {
        vi.mocked(agendamentoRepository.buscarConflito)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ ...agendamentoAtual } as never);

        const resultado = await agendamentoService.simularLote({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            slots: [
                { data: '2026-07-21', horario: '10:00' },
                { data: '2026-07-21', horario: '11:00' },
            ],
        });

        expect(resultado.disponiveis).toEqual([
            { data: '2026-07-21', horario: '10:00' },
        ]);
        expect(resultado.conflitos).toHaveLength(1);
        expect(resultado.conflitos[0].data).toBe('2026-07-21');
        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
        expect(loteAgendamentoRepository.criar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service lote com pacoteId', () => {
    const pacoteCatalogo = (
        quantidadeTotal = 3,
        pacoteServicoId = servicoBase.id,
    ) => ({
        id: 'pacote-1',
        servicos: [{ servicoId: pacoteServicoId, quantidadeTotal }],
    });

    const pacoteClienteAtivo = (pacoteId = 'pacote-1') => ({
        id: 'pacote-cliente-1',
        pacoteId,
        status: 'ATIVO',
        pacote: {
            servicos: [{ servicoId: servicoBase.id, quantidadeTotal: 3 }],
        },
        servicos: [
            {
                servicoId: servicoBase.id,
                quantidadeTotal: 3,
                usosAnteriores: 0,
                quantidadeRestante: 3,
            },
        ],
    });

    const payloadComCatalogo = {
        clienteId: clienteBase.id,
        servicoId: servicoBase.id,
        pacoteId: 'pacote-1',
        origem: 'PAINEL' as const,
        slots: [{ data: '2026-07-21', horario: '10:00' }],
    };

    it('aceita slot de pacote de catálogo no limite configurado de 15 minutos', async () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', '15');
        transacaoMock.pacote.findUnique.mockResolvedValue(pacoteCatalogo());
        vi.mocked(pacoteClienteRepository.criarNaTransacao).mockResolvedValue({
            id: 'pacote-cliente-novo',
        } as never);
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue({
            id: 'lote-1',
        } as never);
        vi.mocked(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).mockResolvedValue(agendamentoAtual as never);

        const resultado = await agendamentoService.criarLote({
            ...payloadComCatalogo,
            slots: [{ data: '2026-07-20', horario: '09:15' }],
        });

        expect(resultado.criados).toHaveLength(1);
        expect(resultado.falhados).toEqual([]);
    });

    it('rejeita pacoteId e pacoteClienteId no serviço', async () => {
        const payload = {
            ...payloadComCatalogo,
            pacoteClienteId: 'pacote-cliente-1',
        };

        await expect(
            agendamentoService.simularLote(payload),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Informe pacoteId ou pacoteClienteId, não ambos.',
        });
        await expect(
            agendamentoService.criarLote(payload),
        ).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it('rejeita mais de 20 slots na simulação e criação', async () => {
        const slots = Array.from({ length: 21 }, (_, index) => ({
            data: '2026-07-21',
            horario: `${String(9 + index).padStart(2, '0')}:00`,
        }));

        await expect(
            agendamentoService.simularLote({ ...payloadComCatalogo, slots }),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('20'),
        });
        await expect(
            agendamentoService.criarLote({ ...payloadComCatalogo, slots }),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('20'),
        });
        expect(pacoteClienteRepository.transacionar).not.toHaveBeenCalled();
    });

    it('transforma excesso da capacidade de catálogo em conflito na simulação', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue(pacoteCatalogo(1));

        const resultado = await agendamentoService.simularLote({
            ...payloadComCatalogo,
            slots: [
                { data: '2026-07-21', horario: '10:00' },
                { data: '2026-07-21', horario: '11:00' },
            ],
        });

        expect(resultado.disponiveis).toHaveLength(1);
        expect(resultado.conflitos).toMatchObject([
            {
                data: '2026-07-21',
                horario: '11:00',
                motivo: expect.stringContaining('Todos os 1 usos restantes'),
            },
        ]);
        expect(pacoteClienteRepository.criarNaTransacao).not.toHaveBeenCalled();
    });

    it('rejeita criação quando slots excedem capacidade restante', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue(pacoteCatalogo(1));
        vi.mocked(pacoteClienteRepository.criarNaTransacao).mockResolvedValue({
            id: 'pacote-cliente-novo',
        } as never);

        await expect(
            agendamentoService.criarLote({
                ...payloadComCatalogo,
                slots: [
                    { data: '2026-07-21', horario: '10:00' },
                    { data: '2026-07-21', horario: '11:00' },
                ],
            }),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('capacidade restante'),
        });
        expect(pacoteClienteRepository.criarNaTransacao).toHaveBeenCalledOnce();
        expect(loteAgendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita serviço fora do pacote', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue(
            pacoteCatalogo(3, 'outro-servico'),
        );

        await expect(
            agendamentoService.criarLote(payloadComCatalogo),
        ).rejects.toMatchObject({
            statusCode: 400,
            message: 'Este serviço não está incluso no pacote selecionado.',
        });
        expect(pacoteClienteRepository.criarNaTransacao).not.toHaveBeenCalled();
    });

    it('rejeita pacote ativo divergente', async () => {
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue(pacoteClienteAtivo('pacote-outro') as never);

        await expect(
            agendamentoService.criarLote(payloadComCatalogo),
        ).rejects.toMatchObject({
            statusCode: 409,
            message:
                'Cliente já possui pacote ativo diferente do pacote selecionado.',
        });
        expect(transacaoMock.pacote.findUnique).not.toHaveBeenCalled();
    });

    it('reutiliza pacote ativo igual e retorna pacoteClienteId', async () => {
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue(pacoteClienteAtivo() as never);
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue({
            id: 'lote-1',
        } as never);
        vi.mocked(
            agendamentoRepository.criarComNumeroNoPacoteNaTransacao,
        ).mockResolvedValue(agendamentoAtual as never);

        const resultado =
            await agendamentoService.criarLote(payloadComCatalogo);

        expect(resultado).toMatchObject({
            loteId: 'lote-1',
            pacoteClienteId: 'pacote-cliente-1',
            falhados: [],
        });
        expect(pacoteClienteRepository.criarNaTransacao).not.toHaveBeenCalled();
        expect(loteAgendamentoRepository.criar).toHaveBeenCalledWith(
            expect.objectContaining({ pacoteClienteId: 'pacote-cliente-1' }),
            transacaoMock,
        );
    });

    it('rejeita origem diferente de PAINEL', async () => {
        await expect(
            agendamentoService.criarLote({
                ...payloadComCatalogo,
                origem: 'GEMINI',
            }),
        ).rejects.toMatchObject({ statusCode: 403 });
        expect(pacoteClienteRepository.transacionar).not.toHaveBeenCalled();
    });

    it('retorna 409 com slot e motivo após conflito transacional', async () => {
        transacaoMock.pacote.findUnique.mockResolvedValue(pacoteCatalogo(2));
        vi.mocked(pacoteClienteRepository.criarNaTransacao).mockResolvedValue({
            id: 'pacote-cliente-novo',
        } as never);
        vi.mocked(loteAgendamentoRepository.criar).mockResolvedValue({
            id: 'lote-1',
        } as never);
        transacaoMock.agendamento.findFirst.mockResolvedValue({
            clienteId: clienteBase.id,
        } as never);

        await expect(
            agendamentoService.criarLote(payloadComCatalogo),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: 'Você já tem agendamento nesse horário.',
            details: {
                slot: { data: '2026-07-21', horario: '10:00' },
                motivo: 'conflito_horario',
            },
        });
    });
});

describe('agendamento.service.cancelar com aplicarParaLote', () => {
    it('propaga cancelamento para agendamentos editáveis do lote, excluindo concluídos/cancelados', async () => {
        const alvo = {
            ...agendamentoAtual,
            id: 'agendamento-1',
            loteId: 'lote-1',
        };
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(
            alvo as never,
        );
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...alvo,
            status: StatusAgendamento.CANCELADO,
        } as never);
        vi.mocked(
            agendamentoRepository.listarSiblingsEditaveisDoLote,
        ).mockResolvedValue([
            { ...agendamentoAtual, id: 'agendamento-2', loteId: 'lote-1' },
            { ...agendamentoAtual, id: 'agendamento-3', loteId: 'lote-1' },
        ] as never);

        const resultado = await agendamentoService.cancelar(
            'agendamento-1',
            false,
            true,
        );

        expect(
            agendamentoRepository.listarSiblingsEditaveisDoLote,
        ).toHaveBeenCalledWith('lote-1', 'agendamento-1');
        expect(agendamentoRepository.cancelar).toHaveBeenCalledTimes(3);
        expect(resultado.agendamentosAfetados).toEqual([
            'agendamento-2',
            'agendamento-3',
        ]);
    });

    it('não propaga quando aplicarParaLote é falso', async () => {
        const alvo = {
            ...agendamentoAtual,
            id: 'agendamento-1',
            loteId: 'lote-1',
        };
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(
            alvo as never,
        );
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...alvo,
            status: StatusAgendamento.CANCELADO,
        } as never);

        const resultado = await agendamentoService.cancelar('agendamento-1');

        expect(
            agendamentoRepository.listarSiblingsEditaveisDoLote,
        ).not.toHaveBeenCalled();
        expect(agendamentoRepository.cancelar).toHaveBeenCalledTimes(1);
        expect(resultado.agendamentosAfetados).toEqual([]);
    });

    it('reagendamento de horário (atualizar) nunca propaga para o lote', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            loteId: 'lote-1',
        } as never);
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            loteId: 'lote-1',
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        } as never);

        await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
        });

        expect(
            agendamentoRepository.listarSiblingsEditaveisDoLote,
        ).not.toHaveBeenCalled();
    });
});
