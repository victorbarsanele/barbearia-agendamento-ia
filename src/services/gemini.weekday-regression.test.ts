import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    listarAgendamentos: vi.fn(),
    listarBloqueios: vi.fn(),
    buscarCliente: vi.fn(),
    listarClientes: vi.fn(),
    criarCliente: vi.fn(),
    listarServicos: vi.fn(),
    listarHorarios: vi.fn(),
    validarDisponibilidade: vi.fn(),
    criarAgendamento: vi.fn(),
}));

vi.mock('@google/genai', () => ({
    GoogleGenAI: class {
        models = { generateContent: vi.fn() };
    },
    FunctionCallingConfigMode: { AUTO: 'AUTO' },
}));
vi.mock('../repositories/agendamento.repository', () => ({
    listarTodos: mocks.listarAgendamentos,
    buscarConflito: vi.fn().mockResolvedValue(null),
    criar: vi.fn(),
    isViolacaoDeSobreposicao: vi.fn().mockReturnValue(false),
}));
vi.mock('../repositories/bloqueio.repository', () => ({
    listarTodos: mocks.listarBloqueios,
    buscarConflito: vi.fn().mockResolvedValue(null),
}));
vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: mocks.buscarCliente,
    listarTodos: mocks.listarClientes,
    criar: mocks.criarCliente,
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
    listarTodos: mocks.listarHorarios,
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
    criar: mocks.criarAgendamento,
    atualizar: vi.fn(),
    cancelar: vi.fn(),
}));

import { StatusAgendamento } from '@prisma/client';
import { InMemoryPendingAgendamentoRepository } from '../repositories/pending-agendamento.repository';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as horarioFuncionamentoRepository from '../repositories/horarioFuncionamento.repository';
import * as agendamentoService from './agendamento.service';
import { __testables } from './gemini.service';

const phone = '5511999999999';
const service = {
    id: 'servico-1',
    nome: 'Corte',
    duracaoMinutos: 60,
    permiteExtensaoFechamento: false,
};
const serviceDate = '2026-10-17T15:00:00-03:00';
let pendingRepository: InMemoryPendingAgendamentoRepository;

function validationConfig() {
    return [
        {
            diaSemana: 6,
            horaAberturaMinutos: 480,
            horaFechamentoMinutos: 1020,
            almocoInicioMinutos: null,
            almocoFimMinutos: null,
            limiteExtensaoMinutos: null,
            ultimoInicioExtensaoMinutos: null,
        },
    ];
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
    vi.clearAllMocks();
    mocks.listarAgendamentos.mockResolvedValue([]);
    mocks.listarBloqueios.mockResolvedValue([]);
    mocks.buscarCliente.mockResolvedValue(null);
    mocks.listarClientes.mockResolvedValue([]);
    mocks.criarCliente.mockResolvedValue({
        id: 'cliente-1',
        nome: 'Cliente Teste',
        telefone: phone,
    });
    mocks.listarServicos.mockResolvedValue([service]);
    mocks.listarHorarios.mockResolvedValue(validationConfig());
    mocks.validarDisponibilidade.mockResolvedValue({
        dataHoraInicio: new Date('2026-10-17T18:00:00Z'),
        dataHoraFim: new Date('2026-10-17T19:00:00Z'),
    });
    mocks.criarAgendamento.mockResolvedValue({
        id: 'agendamento-1',
        cliente: { nome: 'Cliente Teste' },
        servico: { nome: 'Corte' },
        dataHoraInicio: new Date('2026-10-17T18:00:00Z'),
        status: StatusAgendamento.AGENDADO,
    });
    pendingRepository = new InMemoryPendingAgendamentoRepository();
    __testables.setPendingAgendamentoRepository(pendingRepository);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('calendário e validação de weekday do Gemini', () => {
    it('gera calendário de 21 dias correto em Brasília', () => {
        const prompt = __testables.buildSystemPrompt();
        for (const line of [
            'quarta-feira 14/10 (2026-10-14) — hoje',
            'quinta-feira 15/10 (2026-10-15) — amanhã',
            'sexta-feira 16/10 (2026-10-16)',
            'sábado 17/10 (2026-10-17)',
            'sexta-feira 23/10 (2026-10-23)',
            'sábado 24/10 (2026-10-24)',
            'sexta-feira 30/10 (2026-10-30)',
            'sábado 31/10 (2026-10-31)',
            'terça-feira 03/11 (2026-11-03)',
        ]) {
            expect(prompt).toContain(line);
        }
        expect(prompt).toContain('Use SOMENTE a tabela de calendário');
        expect(prompt).toContain('preencha diaDaSemana nas tools');
    });

    it.each([
        ['2026-10-15T02:59:00Z', 'quarta-feira 14/10 (2026-10-14) — hoje'],
        ['2026-10-15T03:00:00Z', 'quinta-feira 15/10 (2026-10-15) — hoje'],
    ])('calcula hoje em Brasília para %s', (now, expected) => {
        vi.setSystemTime(new Date(now));
        expect(__testables.buildSystemPrompt()).toContain(expected);
    });

    it.each([
        ['sabado', '2026-10-30', '2026-10-31', 'sexta-feira', '2026-10-30'],
        ['sabado', '2026-10-23', '2026-10-24', 'sexta-feira', '2026-10-23'],
        ['sabado', '2026-10-16', '2026-10-17', 'sexta-feira', '2026-10-16'],
        ['sexta', '2026-10-17', '2026-10-16', 'sábado', '2026-10-17'],
    ])(
        'rejeita divergência %s/%s sem consultar dependências',
        async (weekday, date, citedDate, realWeekday, actualDate) => {
            const result = await __testables.prepararAgendamentoTool(
                phone,
                'prepare-mismatch',
                {
                    nomeCliente: 'Cliente Não Registrar',
                    servicoId: service.id,
                    dataHoraInicio: `${date}T15:00:00-03:00`,
                    diaDaSemana: weekday,
                },
            );

            expect(result).toMatchObject({
                sucesso: false,
                mensagem: expect.stringContaining(
                    `A data ${date.slice(8)}/${date.slice(5, 7)} é ${realWeekday}`,
                ),
                opcoes: [
                    {
                        dataISO: citedDate,
                        data: `${citedDate.slice(8)}/${citedDate.slice(5, 7)}/2026`,
                    },
                    {
                        dataISO: actualDate,
                        data: `${actualDate.slice(8)}/${actualDate.slice(5, 7)}/2026`,
                    },
                ],
            });
            expect(mocks.listarServicos).not.toHaveBeenCalled();
            expect(mocks.buscarCliente).not.toHaveBeenCalled();
            expect(agendamentoService.validarDisponibilidade).not.toHaveBeenCalled();
            expect(agendamentoService.criar).not.toHaveBeenCalled();
            await expect(
                pendingRepository.consumir(phone, 'confirm-1', new Date()),
            ).resolves.toBeNull();
        },
    );

    it('rejeita divergência na busca sem consultar horários', async () => {
        const result = await __testables.buscarHorariosDisponiveisTool({
            data: '2026-10-30',
            diaDaSemana: 'sabado',
        });
        expect(result).toMatchObject({
            sucesso: false,
            diaSemana: 'sexta-feira',
            opcoes: [
                { dataISO: '2026-10-31', diaSemana: 'sábado' },
                { dataISO: '2026-10-30', diaSemana: 'sexta-feira' },
            ],
        });
        expect(horarioFuncionamentoRepository.listarTodos).not.toHaveBeenCalled();
        expect(agendamentoRepository.listarTodos).not.toHaveBeenCalled();
        expect(bloqueioRepository.listarTodos).not.toHaveBeenCalled();
    });

    it('aceita dia consistente e campo omitido; rejeita enum inválido', async () => {
        await expect(
            __testables.prepararAgendamentoTool(phone, 'm1', {
                nomeCliente: 'Nome',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
                diaDaSemana: 'sabado',
            }),
        ).resolves.toMatchObject({ sucesso: true });
        await expect(
            __testables.prepararAgendamentoTool(phone, 'm2', {
                nomeCliente: 'Nome',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
            }),
        ).resolves.toMatchObject({ sucesso: true });
        await expect(
            __testables.prepararAgendamentoTool(phone, 'm3', {
                nomeCliente: 'Nome',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
                diaDaSemana: 'sabadoX',
            }),
        ).resolves.toMatchObject({ sucesso: false, mensagem: expect.stringContaining('diaDaSemana inválido') });
    });

    it('inclui weekday em resumo, confirmação e consulta', async () => {
        const prepared = await __testables.prepararAgendamentoTool(
            phone,
            'prepare',
            {
                nomeCliente: 'Nome',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
            },
        );
        expect(prepared.resumo).toContain('sábado, 17/10/2026, 15:00');
        const confirmed = await __testables.confirmarAgendamentoTool(
            phone,
            'confirm',
        );
        expect(confirmed.mensagem).toContain('sábado, 17/10/2026, 15:00');

        mocks.buscarCliente.mockResolvedValue({ id: 'cliente-1' });
        mocks.listarAgendamentos.mockResolvedValue([
            {
                id: 'agendamento-1',
                clienteId: 'cliente-1',
                status: StatusAgendamento.AGENDADO,
                dataHoraInicio: new Date('2026-10-17T18:00:00Z'),
                servico: { nome: 'Corte' },
            },
        ]);
        const consulted = await __testables.consultarAgendamentoTool(phone);
        expect(consulted.agendamentos[0].dataHoraInicio).toContain(
            'sábado, 17/10/2026, 15:00',
        );
    });

    it('registra uma linha por desfecho de preparação sem PII', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const validArgs = {
            nomeCliente: 'Nome Privado',
            servicoId: service.id,
            dataHoraInicio: serviceDate,
        };

        await __testables.prepararAgendamentoTool(phone, 'success', validArgs);
        expect(info).toHaveBeenCalledOnce();
        expect(info.mock.calls[0][1]).toEqual({
            tool: 'prepararAgendamento',
            motivo: 'rascunho_salvo',
        });

        await __testables.prepararAgendamentoTool(phone, null, validArgs);
        await __testables.prepararAgendamentoTool(phone, 'bad-name', {
            ...validArgs,
            nomeCliente: ' ',
        });
        await __testables.prepararAgendamentoTool(phone, 'long-name', {
            ...validArgs,
            nomeCliente: 'N'.repeat(121),
        });
        await __testables.prepararAgendamentoTool(phone, 'bad-phone', {
            ...validArgs,
            telefone: '123',
        });
        await __testables.prepararAgendamentoTool(phone, 'bad-day', {
            ...validArgs,
            diaDaSemana: 'invalid',
        });
        await __testables.prepararAgendamentoTool(phone, 'divergent-day', {
            ...validArgs,
            dataHoraInicio: '2026-10-16T15:00:00-03:00',
            diaDaSemana: 'sabado',
        });
        await __testables.prepararAgendamentoTool(phone, 'missing-service', {
            ...validArgs,
            servicoId: 'servico-inexistente',
        });
        mocks.validarDisponibilidade.mockRejectedValueOnce(
            Object.assign(new Error('Horário 2026-10-17T15:00 indisponível'), {
                status: 422,
            }),
        );
        await __testables.prepararAgendamentoTool(phone, 'rejected-time', validArgs);

        const logged = [...info.mock.calls, ...warn.mock.calls];
        for (const [, fields] of logged) {
            const json = JSON.stringify(fields);
            expect(json).not.toContain(phone);
            expect(json).not.toContain('Nome Privado');
        }
        expect(info).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(8);
        expect(
            warn.mock.calls.map(([, fields]) => (fields as { motivo: string }).motivo),
        ).toEqual([
            'sem_message_id',
            'nome_invalido',
            'nome_longo',
            'telefone_invalido',
            'dia_semana_invalido',
            'dia_semana_divergente',
            'servico_nao_encontrado',
            'horario_rejeitado',
        ]);
        expect(warn.mock.calls.at(-1)?.[1]).toMatchObject({
            status: 422,
            mensagem: 'Horário [mascarado]-[mascarado]-[mascarado]T[mascarado]:[mascarado] indisponível',
        });
    });
});
