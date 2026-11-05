import {
    StatusAgendamento,
    StatusPacoteCliente,
    StatusReativacaoEnvio,
} from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import {
    canonicalizarTelefoneWhatsApp,
    variantesTelefoneWhatsApp,
} from '../utils/telefone';
import { chaveDataEmBrasilia, somarDiasAChaveData } from '../utils/dia-semana';
import { TIME_ZONE } from '../services/horario-funcionamento';
import { PrismaReativacaoRepository } from './reativacao.repository';
import * as relatorioRepository from './relatorio.repository';

let sequencia = 0;
let clienteIds: string[] = [];
let servicoIds: string[] = [];
let pacoteIds: string[] = [];
let pacoteClienteIds: string[] = [];
let telefonesIgnorados: string[] = [];

const agoraPadrao = new Date('2026-10-11T15:00:00.000Z');

function telefoneUnico(): string {
    sequencia += 1;
    return `55${String(Date.now() + sequencia).slice(-11)}`;
}

async function criarCliente(nome: string, telefone = telefoneUnico()) {
    const cliente = await prisma.cliente.create({ data: { nome, telefone } });
    clienteIds.push(cliente.id);
    return cliente;
}

async function criarServico(nome = `Serviço ${sequencia + 1}`) {
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

function dataLocalHaDias(agora: Date, dias: number, hora = '12:00'): Date {
    const chaveHoje = chaveDataEmBrasilia(agora);
    const chaveVisita = somarDiasAChaveData(chaveHoje, -dias);
    return fromZonedTime(`${chaveVisita}T${hora}:00`, TIME_ZONE);
}

async function criarAgendamento(data: {
    clienteId: string;
    servicoId: string;
    inicio: Date;
    fim?: Date;
    status?: StatusAgendamento;
    concluido?: boolean;
    pacoteClienteId?: string;
    id?: string;
}) {
    const fim = data.fim ?? new Date(data.inicio.getTime() + 30 * 60 * 1000);
    return prisma.agendamento.create({
        data: {
            ...(data.id ? { id: data.id } : {}),
            clienteId: data.clienteId,
            servicoId: data.servicoId,
            dataHoraInicio: data.inicio,
            dataHoraFim: fim,
            status: data.status ?? StatusAgendamento.AGENDADO,
            concluido: data.concluido ?? false,
            pacoteClienteId: data.pacoteClienteId,
        },
    });
}

async function criarPacoteCliente(data: {
    clienteId: string;
    servicoId: string;
    status: StatusPacoteCliente;
    quantidadeRestante: number;
}) {
    const pacote = await prisma.pacote.create({
        data: {
            nome: `Pacote relatório ${sequencia + 1}`,
            duracaoDias: 30,
            servicos: {
                create: [{ servicoId: data.servicoId, quantidadeTotal: 3 }],
            },
        },
    });
    pacoteIds.push(pacote.id);

    const pacoteCliente = await prisma.pacoteCliente.create({
        data: {
            clienteId: data.clienteId,
            pacoteId: pacote.id,
            dataInicio: agoraPadrao,
            status: data.status,
            servicos: {
                create: [
                    {
                        servicoId: data.servicoId,
                        quantidadeTotal: 3,
                        quantidadeRestante: data.quantidadeRestante,
                    },
                ],
            },
        },
    });
    pacoteClienteIds.push(pacoteCliente.id);
    return pacoteCliente;
}

async function consultar(
    agora = agoraPadrao,
    diasMin = 30,
    diasMax = 180,
    variantesIgnoradas: string[] = [],
) {
    return relatorioRepository.listarClientesInativos(
        agora,
        chaveDataEmBrasilia(agora),
        diasMin,
        diasMax,
        variantesIgnoradas,
    );
}

afterEach(async () => {
    if (clienteIds.length > 0) {
        await prisma.reativacaoEnvio.deleteMany({
            where: { clienteId: { in: clienteIds } },
        });
    }
    if (clienteIds.length > 0) {
        await prisma.agendamento.deleteMany({
            where: { clienteId: { in: clienteIds } },
        });
    }
    if (pacoteClienteIds.length > 0) {
        await prisma.pacoteClienteServico.deleteMany({
            where: { pacoteClienteId: { in: pacoteClienteIds } },
        });
        await prisma.pacoteCliente.deleteMany({
            where: { id: { in: pacoteClienteIds } },
        });
    }
    if (pacoteIds.length > 0) {
        await prisma.pacoteServico.deleteMany({
            where: { pacoteId: { in: pacoteIds } },
        });
        await prisma.pacote.deleteMany({ where: { id: { in: pacoteIds } } });
    }
    if (telefonesIgnorados.length > 0) {
        await prisma.numeroIgnoradoWhatsApp.deleteMany({
            where: { telefone: { in: telefonesIgnorados } },
        });
    }
    if (clienteIds.length > 0) {
        await prisma.cliente.deleteMany({ where: { id: { in: clienteIds } } });
    }
    if (servicoIds.length > 0) {
        await prisma.servico.deleteMany({ where: { id: { in: servicoIds } } });
    }

    clienteIds = [];
    servicoIds = [];
    pacoteIds = [];
    pacoteClienteIds = [];
    telefonesIgnorados = [];
});

describe('relatorio.repository.listarClientesInativos integração', () => {
    it('mantém opt-out e consulta separada da última tentativa não falha', async () => {
        const cliente = await criarCliente('Opt-out com tentativas');
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 40),
        });
        await prisma.cliente.update({
            where: { id: cliente.id },
            data: { optOutMarketingEm: new Date('2026-10-05T12:00:00.000Z') },
        });
        const aceitaEm = new Date('2026-10-01T12:00:00.000Z');
        await prisma.reativacaoEnvio.create({
            data: {
                clienteId: cliente.id,
                status: StatusReativacaoEnvio.ACEITA,
                criadoEm: aceitaEm,
            },
        });
        await prisma.reativacaoEnvio.create({
            data: {
                clienteId: cliente.id,
                status: StatusReativacaoEnvio.FALHOU,
                criadoEm: new Date('2026-10-10T12:00:00.000Z'),
            },
        });

        const resultado = await consultar();
        const tentativas = await new PrismaReativacaoRepository(
            prisma,
        ).buscarResumoReativacoesPorClientes([cliente.id]);

        expect(resultado.itens).toMatchObject([
            { clienteId: cliente.id, optOutMarketing: true },
        ]);
        expect(tentativas.get(cliente.id)).toEqual({
            ultimaTentativa: {
                status: StatusReativacaoEnvio.FALHOU,
                criadoEm: new Date('2026-10-10T12:00:00.000Z'),
            },
            ultimaNaoFalhada: {
                status: StatusReativacaoEnvio.ACEITA,
                criadoEm: aceitaEm,
            },
        });
    });

    it.each([
        { dias: 40, esperado: true, motivo: 'visita há 40 dias entra' },
        { dias: 10, esperado: false, motivo: 'visita há 10 dias fica fora' },
        {
            dias: 200,
            esperado: false,
            motivo: 'visita há 200 dias excede máximo',
        },
    ])('$motivo', async ({ dias, esperado }) => {
        const cliente = await criarCliente(`Cliente ${dias}`);
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, dias),
        });

        const resultado = await consultar();
        expect(
            resultado.itens.some((item) => item.clienteId === cliente.id),
        ).toBe(esperado);
    });

    it.each([30, 180])('inclui exatamente limite de %i dias', async (dias) => {
        const cliente = await criarCliente(`Limite ${dias}`);
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, dias),
        });

        const resultado = await consultar();
        expect(resultado.itens.map((item) => item.clienteId)).toContain(
            cliente.id,
        );
        expect(
            resultado.itens.find((item) => item.clienteId === cliente.id)
                ?.diasSemVir,
        ).toBe(dias);
    });

    it('calcula dias por calendário local na virada da meia-noite de São Paulo', async () => {
        const agora = fromZonedTime('2026-10-11T00:05:00', TIME_ZONE);
        const ontem = somarDiasAChaveData(chaveDataEmBrasilia(agora), -1);
        const inicio = fromZonedTime(`${ontem}T23:30:00`, TIME_ZONE);
        const fim = fromZonedTime(`${ontem}T23:45:00`, TIME_ZONE);
        const cliente = await criarCliente('Fronteira SP');
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio,
            fim,
        });

        const resultado = await consultar(agora, 1, 1);
        expect(resultado.itens).toMatchObject([
            { clienteId: cliente.id, ultimaVisita: ontem, diasSemVir: 1 },
        ]);
    });

    it.each([
        {
            tipo: 'futuro',
            inicio: (agora: Date) => new Date(agora.getTime() + 60 * 60 * 1000),
            fim: (agora: Date) => new Date(agora.getTime() + 90 * 60 * 1000),
        },
        {
            tipo: 'em aberto',
            inicio: (agora: Date) => new Date(agora.getTime() - 10 * 60 * 1000),
            fim: (agora: Date) => new Date(agora.getTime() + 20 * 60 * 1000),
        },
    ])('exclui cliente com agendamento $tipo não cancelado', async (caso) => {
        const cliente = await criarCliente(`Agendamento ${caso.tipo}`);
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 40),
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: caso.inicio(agoraPadrao),
            fim: caso.fim(agoraPadrao),
            status: StatusAgendamento.CONFIRMADO,
        });

        const resultado = await consultar();
        expect(resultado.itens).toHaveLength(0);
    });

    it('não conta agendamento cancelado como visita', async () => {
        const cliente = await criarCliente('Cancelado e visita válida');
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 80),
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 40),
            status: StatusAgendamento.CANCELADO,
        });

        const resultado = await consultar();
        expect(resultado.itens).toMatchObject([
            { clienteId: cliente.id, diasSemVir: 80, totalVisitas: 1 },
        ]);
    });

    it('exclui cliente sem agendamentos', async () => {
        await criarCliente('Sem agendamentos');
        await criarServico();

        const resultado = await consultar();
        expect(resultado.total).toBe(0);
        expect(resultado.itens).toEqual([]);
    });

    it('exclui cliente com somente agendamentos cancelados', async () => {
        const cliente = await criarCliente('Só cancelados');
        const servico = await criarServico();
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 40),
            status: StatusAgendamento.CANCELADO,
        });

        const resultado = await consultar();
        expect(resultado.total).toBe(0);
    });

    it('conta agendamento de pacote encerrado sem concluido marcado', async () => {
        const cliente = await criarCliente('Pacote não concluído');
        const servico = await criarServico();
        const pacoteCliente = await criarPacoteCliente({
            clienteId: cliente.id,
            servicoId: servico.id,
            status: StatusPacoteCliente.FINALIZADO,
            quantidadeRestante: 0,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            pacoteClienteId: pacoteCliente.id,
            inicio: dataLocalHaDias(agoraPadrao, 40),
            concluido: false,
        });

        const resultado = await consultar();
        expect(resultado.itens).toMatchObject([
            { clienteId: cliente.id, totalVisitas: 1 },
        ]);
    });

    it('exclui variantes ignoradas com e sem nono dígito; lista vazia também consulta', async () => {
        const telefoneSemNono = `55118${String(Date.now()).slice(-7)}`;
        const telefoneComNono = `${telefoneSemNono.slice(0, 4)}9${telefoneSemNono.slice(4)}`;
        const clienteComNono = await criarCliente(
            'Telefone com nono',
            telefoneComNono,
        );
        const clienteSemNono = await criarCliente(
            'Telefone sem nono',
            telefoneSemNono,
        );
        const servico = await criarServico();
        for (const [indice, cliente] of [
            clienteComNono,
            clienteSemNono,
        ].entries()) {
            await criarAgendamento({
                clienteId: cliente.id,
                servicoId: servico.id,
                inicio: dataLocalHaDias(
                    agoraPadrao,
                    40,
                    indice === 0 ? '10:00' : '11:00',
                ),
            });
        }
        await prisma.numeroIgnoradoWhatsApp.create({
            data: { telefone: telefoneSemNono, rotulo: 'Teste inativos' },
        });
        telefonesIgnorados.push(telefoneSemNono);

        const canonico = canonicalizarTelefoneWhatsApp(telefoneSemNono);
        const variantes = variantesTelefoneWhatsApp(canonico);
        const filtrado = await consultar(agoraPadrao, 30, 180, variantes);
        expect(filtrado.itens).toEqual([]);

        const semLista = await consultar();
        expect(semLista.itens.map((item) => item.clienteId)).toEqual([
            clienteComNono.id,
            clienteSemNono.id,
        ]);
    });

    it.each([
        {
            status: StatusPacoteCliente.ATIVO,
            saldo: 2,
            esperado: true,
            nome: 'ativo com saldo',
        },
        {
            status: StatusPacoteCliente.ATIVO,
            saldo: 0,
            esperado: false,
            nome: 'ativo sem saldo',
        },
        {
            status: StatusPacoteCliente.FINALIZADO,
            saldo: 2,
            esperado: false,
            nome: 'finalizado com saldo',
        },
        {
            status: StatusPacoteCliente.CANCELADO,
            saldo: 2,
            esperado: false,
            nome: 'cancelado com saldo',
        },
    ])('marca pacote $nome', async ({ status, saldo, esperado, nome }) => {
        const cliente = await criarCliente(`Pacote ${nome}`);
        const servico = await criarServico();
        await criarPacoteCliente({
            clienteId: cliente.id,
            servicoId: servico.id,
            status,
            quantidadeRestante: saldo,
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 40),
        });

        const resultado = await consultar();
        expect(
            resultado.itens.find((item) => item.clienteId === cliente.id)
                ?.pacoteAtivoComSaldo,
        ).toBe(esperado);
    });

    it('retorna última visita, serviço por desempate de id e total de visitas', async () => {
        const cliente = await criarCliente('Desempate');
        const servicoAntigo = await criarServico('Serviço antigo');
        const servicoIdA = await criarServico('Serviço id A');
        const servicoIdZ = await criarServico('Serviço id Z');
        const visitaAntiga = dataLocalHaDias(agoraPadrao, 60);
        const visitaRecente = dataLocalHaDias(agoraPadrao, 40);
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servicoAntigo.id,
            inicio: visitaAntiga,
            id: 'visita-antiga',
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servicoIdA.id,
            inicio: visitaRecente,
            fim: visitaRecente,
            id: 'visita-a',
        });
        await criarAgendamento({
            clienteId: cliente.id,
            servicoId: servicoIdZ.id,
            inicio: visitaRecente,
            fim: visitaRecente,
            id: 'visita-z',
        });

        const resultado = await consultar();
        expect(resultado.itens).toMatchObject([
            {
                clienteId: cliente.id,
                ultimoServico: 'Serviço id Z',
                totalVisitas: 3,
                diasSemVir: 40,
            },
        ]);
    });

    it('ordena por dias sem vir e depois nome', async () => {
        const clienteB = await criarCliente('B cliente');
        const clienteA = await criarCliente('A cliente');
        const clienteC = await criarCliente('C cliente');
        const servico = await criarServico();
        for (const [indice, cliente] of [clienteB, clienteA].entries()) {
            await criarAgendamento({
                clienteId: cliente.id,
                servicoId: servico.id,
                inicio: dataLocalHaDias(
                    agoraPadrao,
                    40,
                    indice === 0 ? '10:00' : '11:00',
                ),
            });
        }
        await criarAgendamento({
            clienteId: clienteC.id,
            servicoId: servico.id,
            inicio: dataLocalHaDias(agoraPadrao, 50),
        });

        const resultado = await consultar();
        expect(resultado.itens.map((item) => item.nome)).toEqual([
            'A cliente',
            'B cliente',
            'C cliente',
        ]);
    });
});
