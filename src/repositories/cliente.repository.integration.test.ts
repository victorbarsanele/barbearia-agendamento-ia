import { StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import * as clienteRepository from './cliente.repository';

type Cenario = {
    clienteId: string;
    servicoId: string;
    pacoteId?: string;
    pacoteClienteId?: string;
    loteId?: string;
};

let cenario: Cenario;

beforeEach(async () => {
    const sufixo = Date.now().toString();
    const cliente = await prisma.cliente.create({
        data: {
            nome: `Cliente exclusao ${sufixo}`,
            telefone: `55119${sufixo.slice(-8)}`,
        },
    });
    const servico = await prisma.servico.create({
        data: {
            nome: `Servico exclusao ${sufixo}`,
            duracaoMinutos: 30,
            preco: null,
            permiteExtensaoFechamento: false,
        },
    });
    cenario = { clienteId: cliente.id, servicoId: servico.id };
});

afterEach(async () => {
    await prisma.agendamento.deleteMany({
        where: { clienteId: cenario.clienteId },
    });
    await prisma.loteAgendamento.deleteMany({
        where: { clienteId: cenario.clienteId },
    });
    if (cenario.pacoteClienteId) {
        await prisma.pacoteClienteServico.deleteMany({
            where: { pacoteClienteId: cenario.pacoteClienteId },
        });
        await prisma.pacoteCliente.deleteMany({
            where: { id: cenario.pacoteClienteId },
        });
    }
    if (cenario.pacoteId) {
        await prisma.pacoteServico.deleteMany({
            where: { pacoteId: cenario.pacoteId },
        });
        await prisma.pacote.deleteMany({ where: { id: cenario.pacoteId } });
    }
    await prisma.cliente.deleteMany({ where: { id: cenario.clienteId } });
    await prisma.servico.deleteMany({ where: { id: cenario.servicoId } });
});

async function criarPacoteCliente(status: StatusPacoteCliente) {
    const pacote = await prisma.pacote.create({
        data: {
            nome: `Pacote exclusao ${Date.now()}`,
            duracaoDias: 30,
            servicos: {
                create: [{ servicoId: cenario.servicoId, quantidadeTotal: 1 }],
            },
        },
    });
    const pacoteCliente = await prisma.pacoteCliente.create({
        data: {
            clienteId: cenario.clienteId,
            pacoteId: pacote.id,
            dataInicio: new Date('2026-10-01T12:00:00.000Z'),
            status,
            servicos: {
                create: [
                    {
                        servicoId: cenario.servicoId,
                        quantidadeTotal: 1,
                        quantidadeRestante: 0,
                    },
                ],
            },
        },
    });
    cenario.pacoteId = pacote.id;
    cenario.pacoteClienteId = pacoteCliente.id;
    return pacoteCliente;
}

async function criarAgendamento(data: {
    status?: StatusAgendamento;
    concluido?: boolean;
    pacoteClienteId?: string;
    loteId?: string;
    inicio: string;
}) {
    return prisma.agendamento.create({
        data: {
            clienteId: cenario.clienteId,
            servicoId: cenario.servicoId,
            pacoteClienteId: data.pacoteClienteId,
            loteId: data.loteId,
            dataHoraInicio: new Date(data.inicio),
            dataHoraFim: new Date(
                new Date(data.inicio).getTime() + 30 * 60 * 1000,
            ),
            status: data.status ?? StatusAgendamento.AGENDADO,
            concluido: data.concluido ?? false,
        },
    });
}

describe('cliente.repository.excluirComHistorico integração', () => {
    it('remove pacote finalizado, agendamentos, lote e saldo por cascata', async () => {
        const pacoteCliente = await criarPacoteCliente(
            StatusPacoteCliente.FINALIZADO,
        );
        const lote = await prisma.loteAgendamento.create({
            data: {
                clienteId: cenario.clienteId,
                servicoId: cenario.servicoId,
            },
        });
        cenario.loteId = lote.id;
        await criarAgendamento({
            pacoteClienteId: pacoteCliente.id,
            loteId: lote.id,
            status: StatusAgendamento.CONCLUIDO,
            concluido: true,
            inicio: '2026-10-01T13:00:00.000Z',
        });

        await clienteRepository.excluirComHistorico(
            cenario.clienteId,
            new Date('2026-10-05T12:00:00.000Z'),
        );

        expect(
            await prisma.cliente.findUnique({
                where: { id: cenario.clienteId },
            }),
        ).toBeNull();
        expect(
            await prisma.pacoteClienteServico.count({
                where: { pacoteClienteId: pacoteCliente.id },
            }),
        ).toBe(0);
    });

    it('bloqueia pacote ativo', async () => {
        await criarPacoteCliente(StatusPacoteCliente.ATIVO);

        await expect(
            clienteRepository.excluirComHistorico(cenario.clienteId),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('bloqueia agendamento futuro em aberto', async () => {
        await criarAgendamento({ inicio: '2026-10-06T13:00:00.000Z' });

        await expect(
            clienteRepository.excluirComHistorico(
                cenario.clienteId,
                new Date('2026-10-05T12:00:00.000Z'),
            ),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('desfaz alterações quando falha depois de apagar agendamentos', async () => {
        const lote = await prisma.loteAgendamento.create({
            data: {
                clienteId: cenario.clienteId,
                servicoId: cenario.servicoId,
            },
        });
        cenario.loteId = lote.id;
        await criarAgendamento({
            loteId: lote.id,
            inicio: '2026-10-01T13:00:00.000Z',
        });

        await prisma.$executeRawUnsafe(`
            CREATE OR REPLACE FUNCTION cliente_exclusao_falha() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION 'falha simulada'; END;
            $$ LANGUAGE plpgsql;
        `);
        await prisma.$executeRawUnsafe(`
            CREATE TRIGGER cliente_exclusao_falha_trigger
            BEFORE DELETE ON "lotes_agendamento"
            FOR EACH ROW EXECUTE FUNCTION cliente_exclusao_falha();
        `);

        try {
            await expect(
                clienteRepository.excluirComHistorico(cenario.clienteId),
            ).rejects.toThrow('falha simulada');
        } finally {
            await prisma.$executeRawUnsafe(
                'DROP TRIGGER cliente_exclusao_falha_trigger ON "lotes_agendamento"',
            );
            await prisma.$executeRawUnsafe(
                'DROP FUNCTION cliente_exclusao_falha()',
            );
        }

        expect(
            await prisma.cliente.findUnique({
                where: { id: cenario.clienteId },
            }),
        ).not.toBeNull();
        expect(
            await prisma.agendamento.count({
                where: { clienteId: cenario.clienteId },
            }),
        ).toBe(1);
    });

    it('remove cliente que possui apenas agendamentos cancelados', async () => {
        await criarAgendamento({
            status: StatusAgendamento.CANCELADO,
            inicio: '2026-10-01T13:00:00.000Z',
        });

        await clienteRepository.excluirComHistorico(cenario.clienteId);

        expect(
            await prisma.cliente.findUnique({
                where: { id: cenario.clienteId },
            }),
        ).toBeNull();
    });
});
