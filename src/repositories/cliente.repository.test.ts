import { StatusAgendamento, StatusPacoteCliente } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import * as clienteRepository from './cliente.repository';

vi.mock('../lib/prisma', () => ({
    default: {
        cliente: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        agendamento: {
            findMany: vi.fn(),
        },
        pacoteCliente: {
            findMany: vi.fn(),
        },
        loteAgendamento: {
            count: vi.fn(),
        },
    },
}));

describe('cliente.repository busca por telefone', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.cliente.findMany).mockResolvedValue([]);
    });

    it.each(['19974191311', '(19) 97419-1311'])(
        'normaliza termo %s para encontrar telefone salvo com 55',
        async (search) => {
            await clienteRepository.listarPaginado({
                search,
                skip: 0,
                take: 10,
            });

            expect(prisma.cliente.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        OR: [
                            {
                                nome: {
                                    contains: search,
                                    mode: 'insensitive',
                                },
                            },
                            { telefone: { contains: '5519974191311' } },
                        ],
                    },
                }),
            );
        },
    );
});

it('classifica concluídos, cancelados, passados, abertos, pacotes e lotes', async () => {
    const agora = new Date('2026-10-05T12:00:00.000Z');
    vi.mocked(prisma.cliente.findUnique).mockResolvedValue({
        id: 'cliente-1',
        nome: 'Maria',
    } as never);
    vi.mocked(prisma.agendamento.findMany).mockResolvedValue([
        {
            status: StatusAgendamento.CONCLUIDO,
            concluido: false,
            dataHoraInicio: new Date('2026-10-01T12:00:00.000Z'),
        },
        {
            status: StatusAgendamento.CANCELADO,
            concluido: false,
            dataHoraInicio: new Date('2026-10-01T13:00:00.000Z'),
        },
        {
            status: StatusAgendamento.AGENDADO,
            concluido: false,
            dataHoraInicio: new Date('2026-10-01T14:00:00.000Z'),
        },
        {
            status: StatusAgendamento.CONFIRMADO,
            concluido: false,
            dataHoraInicio: new Date('2026-10-06T14:00:00.000Z'),
        },
    ] as never);
    vi.mocked(prisma.pacoteCliente.findMany).mockResolvedValue([
        { status: StatusPacoteCliente.ATIVO },
        { status: StatusPacoteCliente.FINALIZADO },
        { status: StatusPacoteCliente.CANCELADO },
    ] as never);
    vi.mocked(prisma.loteAgendamento.count).mockResolvedValue(2);

    await expect(
        clienteRepository.obterResumoExclusao('cliente-1', agora),
    ).resolves.toEqual({
        cliente: { id: 'cliente-1', nome: 'Maria' },
        agendamentos: {
            concluidos: 1,
            cancelados: 1,
            passados: 1,
            emAberto: 1,
        },
        pacotes: { ativos: 1, finalizados: 1, cancelados: 1 },
        lotes: 2,
        temHistorico: true,
        impedimentos: [
            'Cliente possui pacote ativo.',
            'Cliente possui agendamentos futuros em aberto.',
        ],
    });
});
