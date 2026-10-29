import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import prisma from '../lib/prisma';
import * as clienteRepository from './cliente.repository';
import * as agendamentoRepository from './agendamento.repository';
import * as pacoteClienteRepository from './pacoteCliente.repository';
import * as pacoteService from '../services/pacote.service';
import * as horarioFuncionamentoService from '../services/horario-funcionamento.service';

vi.mock('../services/horario-funcionamento.service', () => ({
    TIME_ZONE: 'America/Sao_Paulo',
    carregarConfiguracao: vi.fn().mockResolvedValue([]),
    carregarConfiguracaoNaTransacao: vi.fn((tx) =>
        tx.horarioFuncionamento.findMany(),
    ),
    obterHorarioFuncionamentoComConfiguracao: vi.fn().mockReturnValue({
        diaSemana: 1,
        horaAberturaMinutos: 0,
        horaFechamentoMinutos: 1440,
        almocoInicioMinutos: null,
        almocoFimMinutos: null,
        limiteExtensaoMinutos: null,
        ultimoInicioExtensaoMinutos: null,
    }),
    estaDentroDoHorarioDoAgendamentoComConfiguracao: vi
        .fn()
        .mockReturnValue(true),
}));

import * as agendamentoService from '../services/agendamento.service';

type EntidadesTeste = {
    clienteId: string;
    servicoId: string;
    segundoServicoId?: string;
    pacoteId?: string;
    pacoteClienteId?: string;
    loteId?: string;
};

let entidades: EntidadesTeste;

beforeEach(async () => {
    const sufixo = Date.now().toString();
    const cliente = await prisma.cliente.create({
        data: {
            nome: `Cliente Integracao ${sufixo}`,
            telefone: `55119${sufixo.slice(-8)}`,
        },
    });

    const servico = await prisma.servico.create({
        data: {
            nome: `Servico Integracao ${sufixo}`,
            duracaoMinutos: 30,
            preco: null,
            permiteExtensaoFechamento: false,
        },
    });

    entidades = {
        clienteId: cliente.id,
        servicoId: servico.id,
    };
});

afterEach(async () => {
    if (!entidades) {
        return;
    }

    await prisma.agendamento.deleteMany({
        where: {
            clienteId: entidades.clienteId,
        },
    });

    await prisma.pacoteCliente.deleteMany({
        where: { clienteId: entidades.clienteId },
    });

    if (entidades.pacoteId) {
        await prisma.pacoteServico.deleteMany({
            where: { pacoteId: entidades.pacoteId },
        });
        await prisma.pacote.delete({ where: { id: entidades.pacoteId } });
    }

    await prisma.loteAgendamento.deleteMany({
        where: { clienteId: entidades.clienteId },
    });

    await prisma.cliente.deleteMany({
        where: { id: entidades.clienteId },
    });

    await prisma.servico.deleteMany({
        where: {
            id: {
                in: [entidades.servicoId, entidades.segundoServicoId].filter(
                    (id): id is string => Boolean(id),
                ),
            },
        },
    });
});

async function criarPacoteCatalogo(quantidadeTotal = 3): Promise<string> {
    const pacote = await prisma.pacote.create({
        data: {
            nome: `Pacote transacional ${Date.now()}`,
            duracaoDias: 30,
            servicos: {
                create: [
                    {
                        servicoId: entidades.servicoId,
                        quantidadeTotal,
                    },
                ],
            },
        },
    });
    entidades.pacoteId = pacote.id;
    return pacote.id;
}

function horarioUnico(indice = 0): Date {
    const deslocamento = Date.now() % 1_000_000_000;
    const dia = Math.floor(deslocamento / 86_400_000);
    const milissegundosUnicos = deslocamento % 60_000;
    return new Date(
        Date.UTC(2035, 0, 1 + dia, 15) +
            milissegundosUnicos +
            indice * 60 * 60 * 1000,
    );
}

function slotsDeLote(quantidade: number, inicioData = 1) {
    return Array.from({ length: quantidade }, (_, indice) => {
        const dia = inicioData + Math.floor(indice / 10);
        const hora = 9 + (indice % 10);
        return {
            data: `2035-01-${String(dia).padStart(2, '0')}`,
            horario: `${String(hora).padStart(2, '0')}:00`,
        };
    });
}

async function criarLotePeloCatalogo(
    pacoteId: string,
    slots: { data: string; horario: string }[],
) {
    const resultado = await agendamentoService.criarLote({
        clienteId: entidades.clienteId,
        servicoId: entidades.servicoId,
        pacoteId,
        slots,
        origem: 'PAINEL',
    });
    entidades.loteId = resultado.loteId;
    if (!('pacoteClienteId' in resultado) || !resultado.pacoteClienteId) {
        throw new Error('Lote com pacote do catálogo não retornou vínculo.');
    }
    entidades.pacoteClienteId = resultado.pacoteClienteId;
    return resultado;
}

async function criarAgendamentoComPacoteTransacional(
    pacoteId: string,
    dataHoraInicio: Date,
) {
    return pacoteClienteRepository.transacionar(async (tx) => {
        const clienteExiste =
            await clienteRepository.bloquearParaCriacaoDePacote(
                tx,
                entidades.clienteId,
            );
        if (!clienteExiste) {
            throw new AppError('Cliente não encontrado.', 404);
        }

        let pacoteCliente =
            await pacoteClienteRepository.buscarAtivoPorClienteId(
                entidades.clienteId,
                tx,
            );
        if (pacoteCliente && pacoteCliente.pacoteId !== pacoteId) {
            throw new AppError(
                'Cliente já possui pacote ativo diferente do pacote selecionado.',
                409,
            );
        }

        if (!pacoteCliente) {
            const pacote = await tx.pacote.findUnique({
                where: { id: pacoteId },
                include: { servicos: true },
            });
            if (!pacote) {
                throw new AppError('Pacote não encontrado.', 404);
            }

            pacoteCliente = await pacoteClienteRepository.criarNaTransacao(tx, {
                clienteId: entidades.clienteId,
                pacoteId,
                dataInicio: new Date(),
                servicos: pacote.servicos.map((item) => ({
                    servicoId: item.servicoId,
                    quantidadeTotal: item.quantidadeTotal,
                    usosAnteriores: 0,
                })),
            });
        }

        return agendamentoRepository.criarComNumeroNoPacoteNaTransacao(
            tx,
            {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                pacoteClienteId: pacoteCliente.id,
                dataHoraInicio,
                dataHoraFim: new Date(dataHoraInicio.getTime() + 30 * 60_000),
                status: StatusAgendamento.AGENDADO,
            },
            pacoteCliente.id,
            entidades.servicoId,
        );
    });
}

async function criarAgendamentoPeloServico(
    pacoteId: string,
    dataHoraInicio: Date,
) {
    return agendamentoService.criar({
        clienteId: entidades.clienteId,
        servicoId: entidades.servicoId,
        pacoteId,
        dataHoraInicio: dataHoraInicio.toISOString(),
        origem: 'PAINEL',
    });
}

describe('agendamento.repository integração concorrência', () => {
    it('reverte pacote, saldo, lote e primeiro slot quando segundo slot conflita', async () => {
        const pacoteId = await criarPacoteCatalogo(2);
        const conflitoInicio = new Date('2035-01-02T11:00:00-03:00');
        await prisma.agendamento.create({
            data: {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                dataHoraInicio: conflitoInicio,
                dataHoraFim: new Date(conflitoInicio.getTime() + 30 * 60_000),
            },
        });

        await expect(
            criarLotePeloCatalogo(pacoteId, [
                { data: '2035-01-02', horario: '10:00' },
                { data: '2035-01-02', horario: '11:00' },
            ]),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: {
                slot: { data: '2035-01-02', horario: '11:00' },
                motivo: 'conflito_horario',
            },
        });

        await expect(
            prisma.pacoteCliente.count({
                where: { clienteId: entidades.clienteId },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.pacoteClienteServico.count({
                where: { pacoteCliente: { clienteId: entidades.clienteId } },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.loteAgendamento.count({
                where: { clienteId: entidades.clienteId },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.agendamento.count({
                where: {
                    clienteId: entidades.clienteId,
                    pacoteClienteId: { not: null },
                },
            }),
        ).resolves.toBe(0);
    });

    it('reverte pacote e lote quando quantidade solicitada excede capacidade', async () => {
        const pacoteId = await criarPacoteCatalogo(1);

        await expect(
            criarLotePeloCatalogo(pacoteId, slotsDeLote(2)),
        ).rejects.toMatchObject({ statusCode: 400 });

        await expect(
            prisma.pacoteCliente.count({
                where: { clienteId: entidades.clienteId },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.pacoteClienteServico.count({
                where: { pacoteCliente: { clienteId: entidades.clienteId } },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.loteAgendamento.count({
                where: { clienteId: entidades.clienteId },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.agendamento.count({
                where: {
                    clienteId: entidades.clienteId,
                    pacoteClienteId: { not: null },
                },
            }),
        ).resolves.toBe(0);
    });

    it('cria 20 slots atômicos com numeração contínua dentro do timeout', async () => {
        const pacoteId = await criarPacoteCatalogo(20);
        const inicio = performance.now();
        const resultado = await criarLotePeloCatalogo(
            pacoteId,
            slotsDeLote(20),
        );
        const duracaoMs = Math.round(performance.now() - inicio);
        console.info(`BATCH_ATOMIC_20_MS=${duracaoMs}`);

        expect(resultado.criados).toHaveLength(20);
        expect(resultado.falhados).toEqual([]);
        expect(duracaoMs).toBeLessThan(10_000);
        const agendamentos = await prisma.agendamento.findMany({
            where: { loteId: resultado.loteId },
            orderBy: { numeroNoPacote: 'asc' },
            select: { numeroNoPacote: true },
        });
        expect(agendamentos.map((item) => item.numeroNoPacote)).toEqual(
            Array.from({ length: 20 }, (_, indice) => indice + 1),
        );
    });

    it('serializa lotes concorrentes e reutiliza pacote sem repetir números', async () => {
        const pacoteId = await criarPacoteCatalogo(4);
        const slotsA = slotsDeLote(2, 1);
        const slotsB = slotsDeLote(2, 3);

        const resultados = await Promise.all([
            criarLotePeloCatalogo(pacoteId, slotsA),
            criarLotePeloCatalogo(pacoteId, slotsB),
        ]);

        expect(resultados.map((item) => item.criados.length)).toEqual([2, 2]);
        expect(
            new Set(resultados.map((item) => item.pacoteClienteId)).size,
        ).toBe(1);
        const numeros = await prisma.agendamento.findMany({
            where: {
                clienteId: entidades.clienteId,
                pacoteClienteId: { not: null },
            },
            orderBy: { numeroNoPacote: 'asc' },
            select: { numeroNoPacote: true },
        });
        expect(numeros.map((item) => item.numeroNoPacote)).toEqual([
            1, 2, 3, 4,
        ]);
        await expect(
            prisma.pacoteCliente.count({
                where: {
                    clienteId: entidades.clienteId,
                    status: 'ATIVO',
                },
            }),
        ).resolves.toBe(1);
    });

    it('serializa lote atômico contra POST /pacotes/vincular sem duplicar ativo', async () => {
        const pacoteId = await criarPacoteCatalogo(2);
        const resultados = await Promise.allSettled([
            criarLotePeloCatalogo(pacoteId, slotsDeLote(1)),
            pacoteService.vincularCliente({
                clienteId: entidades.clienteId,
                pacoteId,
            }),
        ]);

        expect(
            resultados.some((resultado) => resultado.status === 'fulfilled'),
        ).toBe(true);
        await expect(
            prisma.pacoteCliente.count({
                where: {
                    clienteId: entidades.clienteId,
                    status: 'ATIVO',
                },
            }),
        ).resolves.toBe(1);
    });

    it('reverte pacote e saldo quando insert do agendamento falha', async () => {
        const pacoteId = await criarPacoteCatalogo();
        const inicio = horarioUnico();
        await prisma.agendamento.create({
            data: {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                dataHoraInicio: inicio,
                dataHoraFim: new Date(inicio.getTime() + 30 * 60_000),
            },
        });

        await expect(
            criarAgendamentoComPacoteTransacional(pacoteId, inicio),
        ).rejects.toMatchObject({ statusCode: 409 });

        await expect(
            prisma.pacoteCliente.count({
                where: { clienteId: entidades.clienteId, pacoteId },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.pacoteClienteServico.count({
                where: { pacoteCliente: { clienteId: entidades.clienteId } },
            }),
        ).resolves.toBe(0);
        await expect(
            prisma.agendamento.count({
                where: {
                    clienteId: entidades.clienteId,
                    pacoteClienteId: { not: null },
                },
            }),
        ).resolves.toBe(0);
    });

    it('serializa dois submits e atribui números distintos no pacote recém-criado', async () => {
        const pacoteId = await criarPacoteCatalogo(2);
        const inicio = horarioUnico();

        const resultados = await Promise.all([
            criarAgendamentoPeloServico(pacoteId, inicio),
            criarAgendamentoPeloServico(
                pacoteId,
                new Date(inicio.getTime() + 60 * 60_000),
            ),
        ]);

        expect(resultados.map((item) => item.numeroNoPacote).sort()).toEqual([
            1, 2,
        ]);
        await expect(
            prisma.pacoteCliente.count({
                where: {
                    clienteId: entidades.clienteId,
                    pacoteId,
                    status: 'ATIVO',
                },
            }),
        ).resolves.toBe(1);
    });

    it('serializa POST /pacotes/vincular contra criação de agendamento com pacote', async () => {
        const pacoteId = await criarPacoteCatalogo(2);
        const inicio = horarioUnico();

        const resultados = await Promise.allSettled([
            pacoteService.vincularCliente({
                clienteId: entidades.clienteId,
                pacoteId,
            }),
            criarAgendamentoPeloServico(pacoteId, inicio),
        ]);

        expect(
            resultados.some((resultado) => resultado.status === 'fulfilled'),
        ).toBe(true);
        await expect(
            prisma.pacoteCliente.count({
                where: {
                    clienteId: entidades.clienteId,
                    pacoteId,
                    status: 'ATIVO',
                },
            }),
        ).resolves.toBe(1);
    });

    it('não lista como editável irmão AGENDADO já concluído', async () => {
        const lote = await prisma.loteAgendamento.create({
            data: {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
            },
        });
        entidades.loteId = lote.id;
        const origem = await prisma.agendamento.create({
            data: {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                loteId: lote.id,
                dataHoraInicio: new Date('2026-09-20T13:00:00.000Z'),
                dataHoraFim: new Date('2026-09-20T13:30:00.000Z'),
            },
        });
        const concluido = await prisma.agendamento.create({
            data: {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                loteId: lote.id,
                dataHoraInicio: new Date('2026-09-20T14:00:00.000Z'),
                dataHoraFim: new Date('2026-09-20T14:30:00.000Z'),
                concluido: true,
            },
        });

        const siblings =
            await agendamentoRepository.listarSiblingsEditaveisDoLote(
                lote.id,
                origem.id,
            );

        expect(siblings.map((item) => item.id)).not.toContain(concluido.id);
    });

    async function criarPacoteComQuatroUsos(usosAnteriores = 0) {
        const pacote = await prisma.pacote.create({
            data: {
                nome: `Pacote numeracao ${Date.now()}`,
                duracaoDias: 30,
                servicos: {
                    create: [
                        { servicoId: entidades.servicoId, quantidadeTotal: 4 },
                    ],
                },
            },
        });
        entidades.pacoteId = pacote.id;

        const pacoteCliente = await prisma.pacoteCliente.create({
            data: {
                clienteId: entidades.clienteId,
                pacoteId: pacote.id,
                dataInicio: new Date(),
                servicos: {
                    create: [
                        {
                            servicoId: entidades.servicoId,
                            quantidadeTotal: 4,
                            ...(usosAnteriores > 0 ? { usosAnteriores } : {}),
                            quantidadeRestante: 4 - usosAnteriores,
                        },
                    ],
                },
            },
        });
        entidades.pacoteClienteId = pacoteCliente.id;
        return pacoteCliente;
    }

    it('começa numeração após usos anteriores', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos(1);
        const agendamento = await agendamentoRepository.criarComNumeroNoPacote(
            {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                pacoteClienteId: pacoteCliente.id,
                dataHoraInicio: new Date('2026-09-20T13:00:00.000Z'),
                dataHoraFim: new Date('2026-09-20T13:30:00.000Z'),
                status: StatusAgendamento.AGENDADO,
            },
            pacoteCliente.id,
            entidades.servicoId,
        );

        expect(agendamento.numeroNoPacote).toBe(2);
    });

    it('bloqueia quando todos os números restantes estão ocupados', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos(1);
        for (const hora of [13, 14, 15]) {
            await agendamentoRepository.criarComNumeroNoPacote(
                {
                    clienteId: entidades.clienteId,
                    servicoId: entidades.servicoId,
                    pacoteClienteId: pacoteCliente.id,
                    dataHoraInicio: new Date(`2026-09-20T${hora}:00:00.000Z`),
                    dataHoraFim: new Date(`2026-09-20T${hora}:30:00.000Z`),
                    status: StatusAgendamento.AGENDADO,
                },
                pacoteCliente.id,
                entidades.servicoId,
            );
        }

        await expect(
            agendamentoRepository.criarComNumeroNoPacote(
                {
                    clienteId: entidades.clienteId,
                    servicoId: entidades.servicoId,
                    pacoteClienteId: pacoteCliente.id,
                    dataHoraInicio: new Date('2026-09-20T16:00:00.000Z'),
                    dataHoraFim: new Date('2026-09-20T16:30:00.000Z'),
                    status: StatusAgendamento.AGENDADO,
                },
                pacoteCliente.id,
                entidades.servicoId,
            ),
        ).rejects.toMatchObject({
            message:
                'Todos os 3 usos restantes deste serviço no pacote já estão agendados ou concluídos.',
        });
    });

    it('mantém números distintos em concorrência com offset', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos(1);
        const criar = (hora: number) =>
            agendamentoRepository.criarComNumeroNoPacote(
                {
                    clienteId: entidades.clienteId,
                    servicoId: entidades.servicoId,
                    pacoteClienteId: pacoteCliente.id,
                    dataHoraInicio: new Date(`2026-09-20T${hora}:00:00.000Z`),
                    dataHoraFim: new Date(`2026-09-20T${hora}:30:00.000Z`),
                    status: StatusAgendamento.AGENDADO,
                },
                pacoteCliente.id,
                entidades.servicoId,
            );

        const resultados = await Promise.all([criar(13), criar(14)]);
        expect(resultados.map((item) => item.numeroNoPacote).sort()).toEqual([
            2, 3,
        ]);
    });

    it('rejeita edição quando agendamento ocupa número afetado', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos();
        await agendamentoRepository.criarComNumeroNoPacote(
            {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                pacoteClienteId: pacoteCliente.id,
                dataHoraInicio: new Date('2026-09-20T13:00:00.000Z'),
                dataHoraFim: new Date('2026-09-20T13:30:00.000Z'),
                status: StatusAgendamento.AGENDADO,
            },
            pacoteCliente.id,
            entidades.servicoId,
        );

        await expect(
            agendamentoRepository.atualizarUsosAnteriores(
                pacoteCliente.id,
                entidades.servicoId,
                1,
            ),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('usa zero como default para linha existente sem usos anteriores', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos();
        await expect(
            prisma.pacoteClienteServico.findUnique({
                where: {
                    pacoteClienteId_servicoId: {
                        pacoteClienteId: pacoteCliente.id,
                        servicoId: entidades.servicoId,
                    },
                },
                select: { usosAnteriores: true },
            }),
        ).resolves.toEqual({ usosAnteriores: 0 });
    });

    it('atribui números distintos em concorrência, reaproveita cancelado e mantém remarcação', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos();
        const criar = (inicio: string) =>
            agendamentoRepository.criarComNumeroNoPacote(
                {
                    clienteId: entidades.clienteId,
                    servicoId: entidades.servicoId,
                    pacoteClienteId: pacoteCliente.id,
                    dataHoraInicio: new Date(inicio),
                    dataHoraFim: new Date(
                        new Date(inicio).getTime() + 30 * 60 * 1000,
                    ),
                    status: StatusAgendamento.AGENDADO,
                },
                pacoteCliente.id,
                entidades.servicoId,
            );

        const resultados = await Promise.all([
            criar('2026-09-20T13:00:00.000Z'),
            criar('2026-09-20T14:00:00.000Z'),
        ]);

        expect(
            resultados.map((agendamento) => agendamento.numeroNoPacote).sort(),
        ).toEqual([1, 2]);

        const resultadoNumero1 = resultados.find(
            (agendamento) => agendamento.numeroNoPacote === 1,
        );
        const resultadoNumero2 = resultados.find(
            (agendamento) => agendamento.numeroNoPacote === 2,
        );
        expect(resultadoNumero1).toBeDefined();
        expect(resultadoNumero2).toBeDefined();

        await agendamentoRepository.cancelar(resultadoNumero1!.id);
        const reaproveitado = await criar('2026-09-20T15:00:00.000Z');
        expect(reaproveitado.numeroNoPacote).toBe(1);

        const remarcado =
            await agendamentoRepository.atualizarComNumeroNoPacote(
                resultadoNumero2!.id,
                {
                    clienteId: entidades.clienteId,
                    servicoId: entidades.servicoId,
                    pacoteClienteId: pacoteCliente.id,
                    dataHoraInicio: new Date('2026-09-20T16:00:00.000Z'),
                    dataHoraFim: new Date('2026-09-20T16:30:00.000Z'),
                    status: StatusAgendamento.AGENDADO,
                },
                pacoteCliente.id,
                entidades.servicoId,
                resultadoNumero2!.numeroNoPacote ?? null,
                StatusAgendamento.AGENDADO,
            );
        expect(remarcado.numeroNoPacote).toBe(2);
    });

    it('faz backfill determinístico, preserva cancelado e permite rerun', async () => {
        const pacoteCliente = await criarPacoteComQuatroUsos();
        const criar = (
            inicio: string,
            status: StatusAgendamento = StatusAgendamento.AGENDADO,
        ) =>
            prisma.agendamento.create({
                data: {
                    clienteId: entidades.clienteId,
                    servicoId: entidades.servicoId,
                    pacoteClienteId: pacoteCliente.id,
                    dataHoraInicio: new Date(inicio),
                    dataHoraFim: new Date(
                        new Date(inicio).getTime() + 30 * 60 * 1000,
                    ),
                    status,
                },
            });

        await criar('2026-09-24T17:30:00.000Z');
        await criar('2026-10-01T18:00:00.000Z');
        await criar('2026-10-08T18:00:00.000Z', StatusAgendamento.CANCELADO);

        const executarBackfill = () =>
            prisma.$executeRaw`
                WITH numerados AS (
                    SELECT id,
                        ROW_NUMBER() OVER (
                            PARTITION BY "pacoteClienteId", "servicoId"
                            ORDER BY "dataHoraInicio" ASC, id ASC
                        )::INTEGER AS numero
                    FROM "agendamentos"
                    WHERE "pacoteClienteId" IS NOT NULL
                      AND status <> 'CANCELADO'
                )
                UPDATE "agendamentos" AS a
                SET "numeroNoPacote" = n.numero
                FROM numerados AS n
                WHERE a.id = n.id
            `;

        await executarBackfill();
        await executarBackfill();

        const agendamentos = await prisma.agendamento.findMany({
            where: { pacoteClienteId: pacoteCliente.id },
            orderBy: { dataHoraInicio: 'asc' },
            select: {
                dataHoraInicio: true,
                status: true,
                numeroNoPacote: true,
            },
        });

        expect(agendamentos).toEqual([
            expect.objectContaining({
                dataHoraInicio: new Date('2026-09-24T17:30:00.000Z'),
                status: StatusAgendamento.AGENDADO,
                numeroNoPacote: 1,
            }),
            expect.objectContaining({
                dataHoraInicio: new Date('2026-10-01T18:00:00.000Z'),
                status: StatusAgendamento.AGENDADO,
                numeroNoPacote: 2,
            }),
            expect.objectContaining({
                status: StatusAgendamento.CANCELADO,
                numeroNoPacote: null,
            }),
        ]);
    });

    it('permite apenas um agendamento para mesmo intervalo em criação paralela', async () => {
        const inicio = new Date('2026-08-10T13:00:00.000Z');
        const fim = new Date('2026-08-10T13:30:00.000Z');

        const payload = {
            clienteId: entidades.clienteId,
            servicoId: entidades.servicoId,
            dataHoraInicio: inicio,
            dataHoraFim: fim,
            status: StatusAgendamento.AGENDADO,
        };

        const resultados = await Promise.allSettled([
            agendamentoRepository.criar(payload),
            agendamentoRepository.criar(payload),
        ]);

        type CriacaoAgendamento = Awaited<
            ReturnType<typeof agendamentoRepository.criar>
        >;

        const sucessos = resultados.filter(
            (
                resultado,
            ): resultado is PromiseFulfilledResult<CriacaoAgendamento> =>
                resultado.status === 'fulfilled',
        );

        const falhas = resultados.filter(
            (resultado): resultado is PromiseRejectedResult =>
                resultado.status === 'rejected',
        );

        expect(sucessos).toHaveLength(1);
        expect(falhas).toHaveLength(1);
        expect(falhas[0].reason).toBeInstanceOf(AppError);
        expect(falhas[0].reason).toMatchObject({
            message: 'Já existe um agendamento nesse horário.',
            statusCode: 409,
        });

        const quantidade = await prisma.agendamento.count({
            where: {
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                dataHoraInicio: inicio,
                dataHoraFim: fim,
                status: { not: StatusAgendamento.CANCELADO },
            },
        });

        expect(quantidade).toBe(1);
    });

    it('cria fora do expediente com override e constraint do banco barra sobreposição', async () => {
        vi.mocked(
            horarioFuncionamentoService.estaDentroDoHorarioDoAgendamentoComConfiguracao,
        ).mockReturnValue(false);
        const inicio = new Date('2035-06-04T08:30:00-03:00');
        const fim = new Date(inicio.getTime() + 30 * 60_000);

        const criado = await agendamentoService.criar({
            clienteId: entidades.clienteId,
            servicoId: entidades.servicoId,
            dataHoraInicio: inicio.toISOString(),
            permitirForaDoExpediente: true,
            origem: 'PAINEL',
        });

        await expect(
            agendamentoRepository.criar({
                clienteId: entidades.clienteId,
                servicoId: entidades.servicoId,
                dataHoraInicio: inicio,
                dataHoraFim: fim,
                status: StatusAgendamento.AGENDADO,
            }),
        ).rejects.toMatchObject({
            message: 'Já existe um agendamento nesse horário.',
            statusCode: 409,
        });

        await expect(
            prisma.agendamento.findUnique({ where: { id: criado.id } }),
        ).resolves.toMatchObject({ id: criado.id });
    });

    it('finaliza pacote somente quando todos os saldos de serviço zeram', async () => {
        const segundoServico = await prisma.servico.create({
            data: {
                nome: `Segundo servico ${Date.now()}`,
                duracaoMinutos: 45,
                preco: null,
                permiteExtensaoFechamento: false,
            },
        });
        entidades.segundoServicoId = segundoServico.id;

        const pacote = await prisma.pacote.create({
            data: {
                nome: `Pacote misto ${Date.now()}`,
                duracaoDias: 30,
                servicos: {
                    create: [
                        { servicoId: entidades.servicoId, quantidadeTotal: 1 },
                        { servicoId: segundoServico.id, quantidadeTotal: 1 },
                    ],
                },
            },
        });
        entidades.pacoteId = pacote.id;

        const pacoteCliente = await prisma.pacoteCliente.create({
            data: {
                clienteId: entidades.clienteId,
                pacoteId: pacote.id,
                dataInicio: new Date(),
                servicos: {
                    create: [
                        {
                            servicoId: entidades.servicoId,
                            quantidadeTotal: 1,
                            quantidadeRestante: 1,
                        },
                        {
                            servicoId: segundoServico.id,
                            quantidadeTotal: 1,
                            quantidadeRestante: 1,
                        },
                    ],
                },
            },
        });
        entidades.pacoteClienteId = pacoteCliente.id;

        const primeiro = await agendamentoRepository.criar({
            clienteId: entidades.clienteId,
            servicoId: entidades.servicoId,
            pacoteClienteId: pacoteCliente.id,
            dataHoraInicio: new Date('2026-08-11T13:00:00.000Z'),
            dataHoraFim: new Date('2026-08-11T13:30:00.000Z'),
            status: StatusAgendamento.AGENDADO,
        });
        const segundo = await agendamentoRepository.criar({
            clienteId: entidades.clienteId,
            servicoId: segundoServico.id,
            pacoteClienteId: pacoteCliente.id,
            dataHoraInicio: new Date('2026-08-11T14:00:00.000Z'),
            dataHoraFim: new Date('2026-08-11T14:45:00.000Z'),
            status: StatusAgendamento.AGENDADO,
        });

        await agendamentoRepository.concluirComPacote(
            primeiro.id,
            pacoteCliente.id,
            entidades.servicoId,
        );

        await expect(
            prisma.pacoteCliente.findUnique({
                where: { id: pacoteCliente.id },
                select: { status: true },
            }),
        ).resolves.toMatchObject({ status: 'ATIVO' });

        await agendamentoRepository.concluirComPacote(
            segundo.id,
            pacoteCliente.id,
            segundoServico.id,
        );

        await expect(
            prisma.pacoteCliente.findUnique({
                where: { id: pacoteCliente.id },
                select: { status: true },
            }),
        ).resolves.toMatchObject({ status: 'FINALIZADO' });
    });
});
