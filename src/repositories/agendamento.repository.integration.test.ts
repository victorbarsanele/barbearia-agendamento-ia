import { StatusAgendamento } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../lib/app-error';
import prisma from '../lib/prisma';
import * as agendamentoRepository from './agendamento.repository';

type EntidadesTeste = {
    clienteId: string;
    servicoId: string;
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
        },
    });

    entidades = {
        clienteId: cliente.id,
        servicoId: servico.id,
    };
});

afterEach(async () => {
    await prisma.agendamento.deleteMany({
        where: {
            clienteId: entidades.clienteId,
        },
    });

    await prisma.cliente.deleteMany({
        where: { id: entidades.clienteId },
    });

    await prisma.servico.deleteMany({
        where: { id: entidades.servicoId },
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
});
