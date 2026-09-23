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
