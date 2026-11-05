import {
    OrigemAgendamento,
    StatusAgendamento,
    StatusPacoteCliente,
} from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import * as relatorioRepository from './relatorio.repository';

const inicio = new Date('2080-10-10T03:00:00.000Z');
const fimExclusivo = new Date('2080-10-12T03:00:00.000Z');
const agora = new Date('2080-10-11T02:45:00.000Z');

const agendamentoIds: string[] = [];
const servicoIds: string[] = [];
let clienteId: string | undefined;
let pacoteId: string | undefined;
let pacoteClienteId: string | undefined;

async function criarServico(nome: string, preco: string | null) {
    const servico = await prisma.servico.create({
        data: {
            nome: `${nome} ${crypto.randomUUID()}`,
            duracaoMinutos: 30,
            preco,
            permiteExtensaoFechamento: false,
        },
    });
    servicoIds.push(servico.id);
    return servico.id;
}

async function criarAgendamento(data: {
    servicoId: string;
    inicio: string;
    precoUnitario: string | null;
    status?: StatusAgendamento;
    pacote?: boolean;
    concluido?: boolean;
}) {
    const dataHoraInicio = new Date(data.inicio);
    const agendamento = await prisma.agendamento.create({
        data: {
            clienteId: clienteId!,
            servicoId: data.servicoId,
            pacoteClienteId: data.pacote ? pacoteClienteId : null,
            dataHoraInicio,
            dataHoraFim: new Date(dataHoraInicio.getTime() + 30 * 60 * 1000),
            precoUnitario: data.precoUnitario,
            status: data.status ?? StatusAgendamento.AGENDADO,
            concluido: data.concluido ?? false,
        },
    });
    agendamentoIds.push(agendamento.id);
}

afterEach(async () => {
    if (agendamentoIds.length > 0) {
        await prisma.agendamento.deleteMany({
            where: { id: { in: agendamentoIds.splice(0) } },
        });
    }
    if (pacoteClienteId) {
        await prisma.pacoteCliente.deleteMany({
            where: { id: pacoteClienteId },
        });
        pacoteClienteId = undefined;
    }
    if (pacoteId) {
        await prisma.pacote.deleteMany({ where: { id: pacoteId } });
        pacoteId = undefined;
    }
    if (clienteId) {
        await prisma.cliente.deleteMany({ where: { id: clienteId } });
        clienteId = undefined;
    }
    if (servicoIds.length > 0) {
        await prisma.servico.deleteMany({
            where: { id: { in: servicoIds.splice(0) } },
        });
    }
});

describe('relatorio.repository.agregarAtendimentos', () => {
    it('agrega realizados, separa pacotes e respeita período local e preço snapshot', async () => {
        const cliente = await prisma.cliente.create({
            data: {
                nome: `Relatorio ${crypto.randomUUID()}`,
                telefone: crypto.randomUUID(),
            },
        });
        clienteId = cliente.id;

        const servicoComPreco = await criarServico('Relatorio preço', '100.00');
        const servicoSemPreco = await criarServico('Relatorio sem preço', null);
        const servicoPrecoZero = await criarServico(
            'Relatorio preço zero',
            '0.00',
        );
        const pacote = await prisma.pacote.create({
            data: {
                nome: `Relatorio pacote ${crypto.randomUUID()}`,
                duracaoDias: 30,
                preco: '0.00',
            },
        });
        pacoteId = pacote.id;
        const pacoteCliente = await prisma.pacoteCliente.create({
            data: {
                clienteId: cliente.id,
                pacoteId: pacote.id,
                dataInicio: new Date('2080-10-01T12:00:00.000Z'),
                status: StatusPacoteCliente.ATIVO,
            },
        });
        pacoteClienteId = pacoteCliente.id;

        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-10T03:00:00.000Z',
            precoUnitario: '0.10',
        });
        await criarAgendamento({
            servicoId: servicoSemPreco,
            inicio: '2080-10-10T03:45:00.000Z',
            precoUnitario: null,
        });
        await criarAgendamento({
            servicoId: servicoPrecoZero,
            inicio: '2080-10-10T05:15:00.000Z',
            precoUnitario: '0.00',
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-10T04:30:00.000Z',
            precoUnitario: '0.90',
            status: StatusAgendamento.CANCELADO,
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-10T06:00:00.000Z',
            precoUnitario: '0.20',
            pacote: true,
            concluido: true,
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-10T07:00:00.000Z',
            precoUnitario: '0.40',
            pacote: true,
            concluido: false,
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-11T15:00:00.000Z',
            precoUnitario: '0.90',
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-12T02:30:00.000Z',
            precoUnitario: '0.30',
            pacote: true,
            concluido: true,
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-12T03:00:00.000Z',
            precoUnitario: '0.50',
            pacote: true,
            concluido: true,
        });
        await criarAgendamento({
            servicoId: servicoComPreco,
            inicio: '2080-10-09T20:00:00.000Z',
            precoUnitario: '0.70',
            pacote: true,
            concluido: true,
        });

        const itens = await relatorioRepository.agregarAtendimentos(
            inicio,
            fimExclusivo,
            agora,
        );
        const comPreco = itens.find(
            (item) => item.servicoId === servicoComPreco,
        );
        const semPreco = itens.find(
            (item) => item.servicoId === servicoSemPreco,
        );
        const precoZero = itens.find(
            (item) => item.servicoId === servicoPrecoZero,
        );

        expect(comPreco).toMatchObject({
            quantidade: 3,
            quantidadeAvulso: 1,
            quantidadePacote: 2,
            valorEstimado: '0.60',
            semPreco: 0,
        });
        expect(semPreco).toMatchObject({
            quantidade: 1,
            quantidadeAvulso: 1,
            quantidadePacote: 0,
            valorEstimado: null,
            semPreco: 1,
        });
        expect(precoZero).toMatchObject({
            quantidade: 1,
            valorEstimado: '0.00',
            semPreco: 0,
        });
        expect(comPreco!.quantidadeAvulso + comPreco!.quantidadePacote).toBe(
            comPreco!.quantidade,
        );
    });
});

describe('relatorio.repository.agruparAgendamentosPorOrigem', () => {
    it('agrupa por origem e status usando createdAt e intervalo semiaberto', async () => {
        const cliente = await prisma.cliente.create({
            data: {
                nome: `Relatorio origem ${crypto.randomUUID()}`,
                telefone: crypto.randomUUID(),
            },
        });
        clienteId = cliente.id;
        const servicoId = await criarServico('Relatorio origem', null);
        let ordemSlot = 0;

        async function criar(
            createdAt: string,
            origem: OrigemAgendamento | null,
            status: StatusAgendamento,
        ): Promise<void> {
            const dataHoraInicio = new Date(
                Date.parse('2080-10-10T03:00:00.000Z') +
                    ordemSlot++ * 60 * 60 * 1000,
            );
            const agendamento = await prisma.agendamento.create({
                data: {
                    clienteId: cliente.id,
                    servicoId,
                    dataHoraInicio,
                    dataHoraFim: new Date(
                        dataHoraInicio.getTime() + 30 * 60 * 1000,
                    ),
                    createdAt: new Date(createdAt),
                    origem,
                    status,
                    precoUnitario: null,
                    concluido: status === StatusAgendamento.CONCLUIDO,
                },
            });
            agendamentoIds.push(agendamento.id);
        }

        await criar(
            '2080-10-10T03:00:00.000Z',
            OrigemAgendamento.WHATSAPP_IA,
            StatusAgendamento.CONCLUIDO,
        );
        await criar(
            '2080-10-10T12:00:00.000Z',
            OrigemAgendamento.WHATSAPP_IA,
            StatusAgendamento.CANCELADO,
        );
        await criar(
            '2080-10-11T03:00:00.000Z',
            OrigemAgendamento.PAINEL,
            StatusAgendamento.AGENDADO,
        );
        await criar(
            '2080-10-11T04:00:00.000Z',
            OrigemAgendamento.PAINEL,
            StatusAgendamento.CANCELADO,
        );
        await criar(
            '2080-10-11T15:00:00.000Z',
            null,
            StatusAgendamento.CONFIRMADO,
        );
        await criar(
            '2080-10-11T16:00:00.000Z',
            null,
            StatusAgendamento.CANCELADO,
        );
        await criar(
            '2080-10-12T03:00:00.000Z',
            OrigemAgendamento.WHATSAPP_IA,
            StatusAgendamento.AGENDADO,
        );
        await criar(
            '2080-10-10T02:59:59.999Z',
            OrigemAgendamento.PAINEL,
            StatusAgendamento.CANCELADO,
        );
        await criar(
            '2080-10-12T03:00:00.001Z',
            null,
            StatusAgendamento.AGENDADO,
        );

        const grupos = await relatorioRepository.agruparAgendamentosPorOrigem(
            new Date('2080-10-10T03:00:00.000Z'),
            new Date('2080-10-12T03:00:00.000Z'),
        );
        const contagens = Object.fromEntries(
            grupos.map(({ origem, status, _count }) => [
                `${origem ?? 'NULL'}:${status}`,
                _count._all,
            ]),
        );

        expect(contagens).toEqual({
            'WHATSAPP_IA:CONCLUIDO': 1,
            'WHATSAPP_IA:CANCELADO': 1,
            'PAINEL:AGENDADO': 1,
            'PAINEL:CANCELADO': 1,
            'NULL:CONFIRMADO': 1,
            'NULL:CANCELADO': 1,
        });
    });
});
