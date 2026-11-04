import { StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import { chaveDataEmBrasilia, somarDiasAChaveData } from '../utils/dia-semana';
import { TIME_ZONE } from '../services/horario-funcionamento';
import * as relatorioRepository from './relatorio.repository';

const agora = new Date('2080-10-11T15:00:00.000Z');
let clienteIds: string[] = [];
let servicoIds: string[] = [];
let pacoteIds: string[] = [];
let pacoteClienteIds: string[] = [];
let agendamentoIds: string[] = [];

function uniqueName(prefixo: string): string {
    return `${prefixo} ${crypto.randomUUID()}`;
}

function telefoneUnico(): string {
    return `55${crypto.randomUUID().replaceAll('-', '').slice(0, 11)}`;
}

function dataLocalHaDias(dias: number, hora = '12:00'): Date {
    const data = somarDiasAChaveData(chaveDataEmBrasilia(agora), -dias);
    return fromZonedTime(`${data}T${hora}:00`, TIME_ZONE);
}

async function criarCliente(nome = uniqueName('Cliente saldo')) {
    const cliente = await prisma.cliente.create({
        data: { nome, telefone: telefoneUnico() },
    });
    clienteIds.push(cliente.id);
    return cliente;
}

async function criarServico(nome = uniqueName('Serviço saldo')) {
    const servico = await prisma.servico.create({
        data: {
            nome,
            duracaoMinutos: 30,
            preco: null,
            permiteExtensaoFechamento: false,
        },
    });
    servicoIds.push(servico.id);
    return servico;
}

async function criarPacoteCliente(data: {
    clienteId: string;
    servicos: Array<{
        servicoId: string;
        total: number;
        restante: number;
    }>;
    status?: StatusPacoteCliente;
    dataInicio?: Date;
}) {
    const pacote = await prisma.pacote.create({
        data: {
            nome: uniqueName('Pacote saldo'),
            duracaoDias: 30,
            preco: '100.00',
        },
    });
    pacoteIds.push(pacote.id);

    const pacoteCliente = await prisma.pacoteCliente.create({
        data: {
            clienteId: data.clienteId,
            pacoteId: pacote.id,
            dataInicio: data.dataInicio ?? dataLocalHaDias(30),
            status: data.status ?? StatusPacoteCliente.ATIVO,
            servicos: {
                create: data.servicos.map((servico) => ({
                    servicoId: servico.servicoId,
                    quantidadeTotal: servico.total,
                    quantidadeRestante: servico.restante,
                })),
            },
        },
    });
    pacoteClienteIds.push(pacoteCliente.id);
    return pacoteCliente;
}

async function criarAgendamento(data: {
    clienteId: string;
    servicoId: string;
    inicio: Date;
    fim?: Date;
    pacoteClienteId?: string;
    status?: StatusAgendamento;
    concluido?: boolean;
}) {
    const agendamento = await prisma.agendamento.create({
        data: {
            clienteId: data.clienteId,
            servicoId: data.servicoId,
            pacoteClienteId: data.pacoteClienteId,
            dataHoraInicio: data.inicio,
            dataHoraFim:
                data.fim ?? new Date(data.inicio.getTime() + 30 * 60 * 1000),
            status: data.status ?? StatusAgendamento.AGENDADO,
            concluido: data.concluido ?? false,
        },
    });
    agendamentoIds.push(agendamento.id);
    return agendamento;
}

async function consultar(
    diasParado = 7,
    somenteParados = false,
    limite?: number,
) {
    return relatorioRepository.listarSaldoPacotes(
        agora,
        chaveDataEmBrasilia(agora),
        diasParado,
        somenteParados,
        limite,
    );
}

function itemDo(
    resultado: Awaited<ReturnType<typeof consultar>>,
    pacoteClienteId: string,
) {
    return resultado.itens.find(
        (item) => item.pacoteClienteId === pacoteClienteId,
    );
}

afterEach(async () => {
    if (agendamentoIds.length) {
        await prisma.agendamento.deleteMany({
            where: { id: { in: agendamentoIds } },
        });
    }
    if (pacoteClienteIds.length) {
        await prisma.pacoteCliente.deleteMany({
            where: { id: { in: pacoteClienteIds } },
        });
    }
    if (pacoteIds.length) {
        await prisma.pacote.deleteMany({ where: { id: { in: pacoteIds } } });
    }
    if (clienteIds.length) {
        await prisma.cliente.deleteMany({ where: { id: { in: clienteIds } } });
    }
    if (servicoIds.length) {
        await prisma.servico.deleteMany({ where: { id: { in: servicoIds } } });
    }

    clienteIds = [];
    servicoIds = [];
    pacoteIds = [];
    pacoteClienteIds = [];
    agendamentoIds = [];
});

describe('relatorio.repository.listarSaldoPacotes integração', () => {
    it('inclui apenas pacotes ATIVOS com saldo positivo', async () => {
        const baseline = await consultar();
        const cliente = await criarCliente();
        const servico = await criarServico();
        const elegivel = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const saldoZero = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 0 }],
        });
        const finalizado = await criarPacoteCliente({
            clienteId: cliente.id,
            status: StatusPacoteCliente.FINALIZADO,
            servicos: [{ servicoId: servico.id, total: 3, restante: 2 }],
        });
        const cancelado = await criarPacoteCliente({
            clienteId: cliente.id,
            status: StatusPacoteCliente.CANCELADO,
            servicos: [{ servicoId: servico.id, total: 3, restante: 2 }],
        });

        const resultado = await consultar();
        expect(itemDo(resultado, elegivel.id)).toBeDefined();
        expect(itemDo(resultado, saldoZero.id)).toBeUndefined();
        expect(itemDo(resultado, finalizado.id)).toBeUndefined();
        expect(itemDo(resultado, cancelado.id)).toBeUndefined();
        expect(resultado.totalAtivos).toBe(baseline.totalAtivos + 1);
    });

    it('agrega total, restante e agendados por serviço, sem contar cancelados ou concluídos', async () => {
        const cliente = await criarCliente();
        const corte = await criarServico('A Corte saldo');
        const barba = await criarServico('B Barba saldo');
        const outroServico = await criarServico('C Outro saldo');
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [
                { servicoId: corte.id, total: 5, restante: 3 },
                { servicoId: barba.id, total: 2, restante: 1 },
            ],
        });
        const futuro = new Date(agora.getTime() + 60 * 60 * 1000);

        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: corte.id,
            pacoteClienteId: pacote.id,
            inicio: futuro,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: corte.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(futuro.getTime() + 60 * 60 * 1000),
            status: StatusAgendamento.CANCELADO,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: barba.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(futuro.getTime() + 2 * 60 * 60 * 1000),
            concluido: true,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: outroServico.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(futuro.getTime() + 3 * 60 * 60 * 1000),
        });

        const item = itemDo(await consultar(), pacote.id)!;
        expect(item.servicos).toEqual([
            {
                servicoId: corte.id,
                nome: corte.nome,
                total: 5,
                restante: 3,
                agendados: 1,
            },
            {
                servicoId: barba.id,
                nome: barba.nome,
                total: 2,
                restante: 1,
                agendados: 0,
            },
        ]);
        expect(item).toMatchObject({ totalRestante: 4, totalAgendados: 1 });
    });

    it('conta aConcluir só para agendamentos encerrados, não cancelados e não concluídos', async () => {
        const cliente = await criarCliente();
        const servico = await criarServico();
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 5, restante: 3 }],
        });
        const passado = dataLocalHaDias(2);

        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            pacoteClienteId: pacote.id,
            inicio: passado,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(passado.getTime() + 60 * 60 * 1000),
            status: StatusAgendamento.CANCELADO,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(passado.getTime() + 2 * 60 * 60 * 1000),
            concluido: true,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(agora.getTime() + 3 * 60 * 60 * 1000),
        });

        expect(itemDo(await consultar(), pacote.id)?.aConcluir).toBe(1);
    });

    it('usa visitas não canceladas encerradas, incluindo pacote finalizado e visita avulsa', async () => {
        const clientePacote = await criarCliente();
        const clienteAvulso = await criarCliente();
        const servico = await criarServico();
        const pacote1 = await criarPacoteCliente({
            clienteId: clientePacote.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const pacote2 = await criarPacoteCliente({
            clienteId: clienteAvulso.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const finalizado = await criarPacoteCliente({
            clienteId: clientePacote.id,
            status: StatusPacoteCliente.FINALIZADO,
            servicos: [{ servicoId: servico.id, total: 3, restante: 0 }],
        });

        await criarAgendamento({
            clienteId: clientePacote.id,
            servicoId: servico.id,
            pacoteClienteId: finalizado.id,
            inicio: dataLocalHaDias(4),
            concluido: false,
        });
        await criarAgendamento({
            clienteId: clientePacote.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(10),
        });
        await criarAgendamento({
            clienteId: clienteAvulso.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(3),
        });

        const resultado = await consultar();
        expect(itemDo(resultado, pacote1.id)?.diasSemVir).toBe(4);
        expect(itemDo(resultado, pacote2.id)?.diasSemVir).toBe(3);
    });

    it('marca parado no limite inclusivo quando cliente não tem horário futuro', async () => {
        const cliente = await criarCliente();
        const servico = await criarServico();
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(7),
        });

        expect(itemDo(await consultar(7), pacote.id)).toMatchObject({
            diasSemVir: 7,
            temHorarioMarcado: false,
            parado: true,
        });
    });

    it('não marca parado quando existe horário futuro do pacote', async () => {
        const cliente = await criarCliente();
        const servico = await criarServico();
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            pacoteClienteId: pacote.id,
            inicio: new Date(agora.getTime() + 60 * 60 * 1000),
        });

        expect(itemDo(await consultar(1), pacote.id)).toMatchObject({
            temHorarioMarcado: true,
            parado: false,
        });
    });

    it('não marca parado quando existe horário futuro avulso', async () => {
        const cliente = await criarCliente();
        const servico = await criarServico();
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: new Date(agora.getTime() + 60 * 60 * 1000),
        });

        expect(itemDo(await consultar(1), pacote.id)).toMatchObject({
            temHorarioMarcado: true,
            parado: false,
        });
    });

    it('calcula dias sem visita a partir de dataInicio local', async () => {
        const cliente = await criarCliente();
        const servico = await criarServico();
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            dataInicio: dataLocalHaDias(9),
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });

        expect(itemDo(await consultar(), pacote.id)).toMatchObject({
            dataInicio: somarDiasAChaveData(chaveDataEmBrasilia(agora), -9),
            ultimaVisita: null,
            semVisita: true,
            diasSemVir: 9,
        });
    });

    it('calcula fronteira de calendário em São Paulo', async () => {
        const agoraVirada = fromZonedTime('2080-10-11T00:05:00', TIME_ZONE);
        const ontem = somarDiasAChaveData(chaveDataEmBrasilia(agoraVirada), -1);
        const cliente = await criarCliente();
        const servico = await criarServico();
        const pacote = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: fromZonedTime(`${ontem}T23:30:00`, TIME_ZONE),
            fim: fromZonedTime(`${ontem}T23:45:00`, TIME_ZONE),
        });

        const resultado = await relatorioRepository.listarSaldoPacotes(
            agoraVirada,
            chaveDataEmBrasilia(agoraVirada),
            1,
            false,
        );
        expect(itemDo(resultado, pacote.id)).toMatchObject({
            ultimaVisita: ontem,
            diasSemVir: 1,
        });
    });

    it('filtra somente parados sem alterar totais pré-filtro', async () => {
        const baseline = await consultar();
        const clienteParado = await criarCliente();
        const clienteMarcado = await criarCliente();
        const servico = await criarServico();
        const parado = await criarPacoteCliente({
            clienteId: clienteParado.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const marcado = await criarPacoteCliente({
            clienteId: clienteMarcado.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarAgendamento({
            clienteId: clienteMarcado.id,
            servicoId: servico.id,
            inicio: new Date(agora.getTime() + 60 * 60 * 1000),
        });

        const resultado = await consultar(7, true);
        expect(resultado).toMatchObject({
            totalAtivos: baseline.totalAtivos + 2,
            totalParados: baseline.totalParados + 1,
            total: baseline.totalParados + 1,
        });
        expect(itemDo(resultado, parado.id)).toBeDefined();
        expect(itemDo(resultado, marcado.id)).toBeUndefined();
    });

    it('retorna dois vínculos ATIVOS do mesmo cliente como linhas distintas', async () => {
        const baseline = await consultar();
        const cliente = await criarCliente();
        const servico = await criarServico();
        const primeiro = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const segundo = await criarPacoteCliente({
            clienteId: cliente.id,
            servicos: [{ servicoId: servico.id, total: 2, restante: 2 }],
        });

        const resultado = await consultar();
        expect(itemDo(resultado, primeiro.id)).toBeDefined();
        expect(itemDo(resultado, segundo.id)).toBeDefined();
        expect(resultado.totalAtivos).toBe(baseline.totalAtivos + 2);
    });

    it('ordena parados, dias sem vir e nome', async () => {
        const clienteZ = await criarCliente('Z Cliente');
        const clienteA = await criarCliente('A Cliente');
        const clienteRecente = await criarCliente('B Cliente');
        const clienteAgendado = await criarCliente('0 Cliente');
        const servico = await criarServico();
        const pacoteZ = await criarPacoteCliente({
            clienteId: clienteZ.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const pacoteA = await criarPacoteCliente({
            clienteId: clienteA.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const pacoteRecente = await criarPacoteCliente({
            clienteId: clienteRecente.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        const pacoteAgendado = await criarPacoteCliente({
            clienteId: clienteAgendado.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarAgendamento({
            clienteId: clienteZ.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(20, '10:00'),
        });
        await criarAgendamento({
            clienteId: clienteA.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(20, '11:00'),
        });
        await criarAgendamento({
            clienteId: clienteRecente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(10, '12:00'),
        });
        await criarAgendamento({
            clienteId: clienteAgendado.id,
            servicoId: servico.id,
            inicio: new Date(agora.getTime() + 60 * 60 * 1000),
        });

        const resultado = await consultar();
        const idsOrdenados = resultado.itens
            .map((item) => item.pacoteClienteId)
            .filter((id) =>
                [
                    pacoteA.id,
                    pacoteZ.id,
                    pacoteRecente.id,
                    pacoteAgendado.id,
                ].includes(id),
            );
        expect(idsOrdenados).toEqual([
            pacoteA.id,
            pacoteZ.id,
            pacoteRecente.id,
            pacoteAgendado.id,
        ]);
    });

    it('mantém total anterior ao teto e limita apenas itens', async () => {
        const baseline = await consultar();
        const clienteA = await criarCliente();
        const clienteB = await criarCliente();
        const servico = await criarServico();
        await criarPacoteCliente({
            clienteId: clienteA.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });
        await criarPacoteCliente({
            clienteId: clienteB.id,
            servicos: [{ servicoId: servico.id, total: 3, restante: 1 }],
        });

        const resultado = await consultar(7, false, 1);
        expect(resultado.total).toBe(baseline.total + 2);
        expect(resultado.itens).toHaveLength(1);

        const semItens = await consultar(7, false, 0);
        expect(semItens.total).toBe(baseline.total + 2);
        expect(semItens.itens).toEqual([]);
    });
});
