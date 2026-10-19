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
    it('rejeita placeholder sem salvar rascunho, resumo ou PII em logs', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await __testables.prepararAgendamentoTool(
            phone,
            'placeholder-name',
            {
                nomeCliente: 'Cliente',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
            },
            ['Meu nome é João Silva'],
        );

        expect(result).toMatchObject({
            sucesso: false,
            mensagem: expect.stringContaining(
                'Pergunte o nome completo ao cliente e aguarde a resposta',
            ),
        });
        expect(result.resumo).toBeUndefined();
        await expect(
            pendingRepository.obterValido(phone, new Date()),
        ).resolves.toBeNull();
        expect(warn).toHaveBeenCalledWith(
            '[GEMINI TOOL] prepararAgendamento nome_invalido',
            { tool: 'prepararAgendamento', motivo: 'nome_invalido' },
        );
        expect(JSON.stringify(warn.mock.calls)).not.toContain('Cliente');
        expect(JSON.stringify(warn.mock.calls)).not.toContain(phone);
    });

    it('salva nome completo quando origem aparece em mensagens do cliente', async () => {
        const result = await __testables.prepararAgendamentoTool(
            phone,
            'verified-name',
            {
                nomeCliente: 'João Silva',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
            },
            ['me chamo JOAO', 'SILVA'],
        );

        expect(result.sucesso).toBe(true);
        expect(result.resumo).toContain('Nome: João Silva');
        await expect(
            pendingRepository.obterValido(phone, new Date()),
        ).resolves.toMatchObject({ nomeCliente: 'João Silva' });
    });

    it('usa nome armazenado de Cliente existente sem validar nome do modelo', async () => {
        mocks.buscarCliente.mockResolvedValue({
            id: 'cliente-existente',
            nome: 'Maria da Conceição',
            telefone: phone,
        });

        const result = await __testables.prepararAgendamentoTool(
            phone,
            'existing-client-name',
            {
                nomeCliente: 'Cliente',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
            },
            [],
        );

        expect(result.sucesso).toBe(true);
        expect(result.resumo).toContain('Nome: Maria da Conceição');
        await expect(
            pendingRepository.obterValido(phone, new Date()),
        ).resolves.toMatchObject({ nomeCliente: 'Maria da Conceição' });
        expect(mocks.criarCliente).not.toHaveBeenCalled();
        expect(mocks.validarDisponibilidade).toHaveBeenLastCalledWith(
            serviceDate,
            service.duracaoMinutos,
            service.permiteExtensaoFechamento,
            false,
            'GEMINI',
            'cliente-existente',
        );
    });

    it('marca dias sem funcionamento no calendário e mantém dias configurados abertos', () => {
        const configuracao = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaAberturaMinutos: 540,
            horaFechamentoMinutos: 1200,
            almocoInicioMinutos: null,
            almocoFimMinutos: null,
            limiteExtensaoMinutos: null,
            ultimoInicioExtensaoMinutos: null,
        }));
        const prompt = __testables.buildSystemPrompt(
            undefined,
            undefined,
            configuracao,
        );
        for (const line of [
            'quarta-feira 14/10/2026 — hoje',
            'quinta-feira 15/10/2026 — amanhã',
            'sexta-feira 16/10/2026',
            'sábado 17/10/2026',
            'domingo 18/10/2026 (FECHADO)',
            'sexta-feira 23/10/2026',
            'sábado 24/10/2026',
            'domingo 25/10/2026 (FECHADO)',
            'sexta-feira 30/10/2026',
            'sábado 31/10/2026',
            'domingo 01/11/2026 (FECHADO)',
            'terça-feira 03/11/2026',
        ]) {
            expect(prompt).toContain(line);
        }
        expect(prompt).not.toContain('quarta-feira 14/10/2026 (FECHADO)');
        expect(prompt).toContain('Use SOMENTE a tabela de calendário');
        expect(prompt).toContain('preencha diaDaSemana nas tools');
    });

    it('não marca domingo fechado quando há configuração para domingo', () => {
        const configuracao = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaAberturaMinutos: 540,
            horaFechamentoMinutos: 1200,
            almocoInicioMinutos: null,
            almocoFimMinutos: null,
            limiteExtensaoMinutos: null,
            ultimoInicioExtensaoMinutos: null,
        }));
        const prompt = __testables.buildSystemPrompt(
            undefined,
            undefined,
            configuracao,
        );

        expect(prompt).toContain('domingo 18/10/2026');
        expect(prompt).not.toContain('domingo 18/10/2026 (FECHADO)');
    });

    it('marca dia sem registro como fechado', () => {
        const configuracao = [0, 2, 3, 4, 5, 6].map((diaSemana) => ({
            diaSemana,
            horaAberturaMinutos: 540,
            horaFechamentoMinutos: 1200,
            almocoInicioMinutos: null,
            almocoFimMinutos: null,
            limiteExtensaoMinutos: null,
            ultimoInicioExtensaoMinutos: null,
        }));
        const prompt = __testables.buildSystemPrompt(
            undefined,
            undefined,
            configuracao,
        );

        expect(prompt).toContain('segunda-feira 19/10/2026 (FECHADO)');
        expect(prompt).not.toContain('terça-feira 20/10/2026 (FECHADO)');
    });

    it('inclui regras de disponibilidade e resposta à oferta de outra data', () => {
        const prompt = __testables.buildSystemPrompt();

        expect(prompt).toContain(
            'Nunca afirme, sugira ou insinue disponibilidade para data ou horário sem retorno de buscarHorariosDisponiveis no mesmo turno',
        );
        expect(prompt).toContain(
            'Nunca ofereça, sugira ou consulte como opção dia identificado como fechado no calendário.',
        );
        expect(prompt).toContain(
            'pergunte apenas qual data prefere, sem sugerir datas.',
        );
        expect(
            (
                __testables.functionDeclarations as Array<{
                    name: string;
                    description: string;
                }>
            ).find((tool) => tool.name === 'buscarHorariosDisponiveis')
                ?.description,
        ).not.toMatch(/09h-20h|08h-17h/u);
    });

    it.each([
        ['2026-10-15T02:59:00Z', 'quarta-feira 14/10/2026 — hoje'],
        ['2026-10-15T03:00:00Z', 'quinta-feira 15/10/2026 — hoje'],
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
                [],
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
            expect(
                agendamentoService.validarDisponibilidade,
            ).not.toHaveBeenCalled();
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
        expect(
            horarioFuncionamentoRepository.listarTodos,
        ).not.toHaveBeenCalled();
        expect(agendamentoRepository.listarTodos).not.toHaveBeenCalled();
        expect(bloqueioRepository.listarTodos).not.toHaveBeenCalled();
    });

    it('aceita dia consistente e campo omitido; rejeita enum inválido', async () => {
        await expect(
            __testables.prepararAgendamentoTool(
                phone,
                'm1',
                {
                    nomeCliente: 'João Silva',
                    servicoId: service.id,
                    dataHoraInicio: serviceDate,
                    diaDaSemana: 'sabado',
                },
                ['João Silva'],
            ),
        ).resolves.toMatchObject({ sucesso: true });
        await expect(
            __testables.prepararAgendamentoTool(
                phone,
                'm2',
                {
                    nomeCliente: 'João Silva',
                    servicoId: service.id,
                    dataHoraInicio: serviceDate,
                },
                ['João Silva'],
            ),
        ).resolves.toMatchObject({ sucesso: true });
        await expect(
            __testables.prepararAgendamentoTool(
                phone,
                'm3',
                {
                    nomeCliente: 'João Silva',
                    servicoId: service.id,
                    dataHoraInicio: serviceDate,
                    diaDaSemana: 'sabadoX',
                },
                ['João Silva'],
            ),
        ).resolves.toMatchObject({
            sucesso: false,
            mensagem: expect.stringContaining('diaDaSemana inválido'),
        });
    });

    it('inclui weekday em resumo, confirmação e consulta', async () => {
        const prepared = await __testables.prepararAgendamentoTool(
            phone,
            'prepare',
            {
                nomeCliente: 'João Silva',
                servicoId: service.id,
                dataHoraInicio: serviceDate,
            },
            ['João Silva'],
        );
        expect(prepared.resumo).toContain('sábado, 17/10/2026, às 15:00');
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

        await __testables.prepararAgendamentoTool(phone, 'success', validArgs, [
            'Nome Privado',
        ]);
        expect(info).toHaveBeenCalledOnce();
        expect(info.mock.calls[0][1]).toEqual({
            tool: 'prepararAgendamento',
            motivo: 'rascunho_salvo',
        });

        await __testables.prepararAgendamentoTool(phone, null, validArgs, [
            'Nome Privado',
        ]);
        await __testables.prepararAgendamentoTool(
            phone,
            'bad-name',
            {
                ...validArgs,
                nomeCliente: ' ',
            },
            ['Nome Privado'],
        );
        await __testables.prepararAgendamentoTool(
            phone,
            'long-name',
            {
                ...validArgs,
                nomeCliente: 'N'.repeat(121),
            },
            ['N'.repeat(121)],
        );
        await __testables.prepararAgendamentoTool(
            phone,
            'bad-phone',
            {
                ...validArgs,
                telefone: '123',
            },
            ['Nome Privado'],
        );
        await __testables.prepararAgendamentoTool(
            phone,
            'bad-day',
            {
                ...validArgs,
                diaDaSemana: 'invalid',
            },
            ['Nome Privado'],
        );
        await __testables.prepararAgendamentoTool(
            phone,
            'divergent-day',
            {
                ...validArgs,
                dataHoraInicio: '2026-10-16T15:00:00-03:00',
                diaDaSemana: 'sabado',
            },
            ['Nome Privado'],
        );
        await __testables.prepararAgendamentoTool(
            phone,
            'missing-service',
            {
                ...validArgs,
                servicoId: 'servico-inexistente',
            },
            ['Nome Privado'],
        );
        mocks.validarDisponibilidade.mockRejectedValueOnce(
            Object.assign(new Error('Horário 2026-10-17T15:00 indisponível'), {
                status: 422,
            }),
        );
        await __testables.prepararAgendamentoTool(
            phone,
            'rejected-time',
            validArgs,
            ['Nome Privado'],
        );

        const logged = [...info.mock.calls, ...warn.mock.calls];
        for (const [, fields] of logged) {
            const json = JSON.stringify(fields);
            expect(json).not.toContain(phone);
            expect(json).not.toContain('Nome Privado');
        }
        expect(info).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(8);
        expect(
            warn.mock.calls.map(
                ([, fields]) => (fields as { motivo: string }).motivo,
            ),
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
            mensagem:
                'Horário [mascarado]-[mascarado]-[mascarado]T[mascarado]:[mascarado] indisponível',
        });
    });
});
