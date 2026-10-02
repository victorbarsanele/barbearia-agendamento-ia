import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../lib/app-error';
import prisma from '../lib/prisma';
import * as agendamentoRepository from './agendamento.repository';

type EntidadesTeste = {
    clienteId: string;
    servicoId: string;
    segundoServicoId?: string;
    pacoteId?: string;
    pacoteClienteId?: string;
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

    if (entidades.pacoteClienteId) {
        await prisma.pacoteClienteServico.deleteMany({
            where: { pacoteClienteId: entidades.pacoteClienteId },
        });
        await prisma.pacoteCliente.delete({
            where: { id: entidades.pacoteClienteId },
        });
    }

    if (entidades.pacoteId) {
        await prisma.pacoteServico.deleteMany({
            where: { pacoteId: entidades.pacoteId },
        });
        await prisma.pacote.delete({ where: { id: entidades.pacoteId } });
    }

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

describe('agendamento.repository integração concorrência', () => {
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
