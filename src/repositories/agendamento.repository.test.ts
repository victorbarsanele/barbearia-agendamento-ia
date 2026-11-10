import {
    OrigemConclusaoAgendamento,
    StatusAgendamento,
    StatusPacoteCliente,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import {
    atualizarUsosAnteriores,
    atualizarComPacoteDoCatalogoNaTransacao,
    atualizarComNumeroNoPacote,
    atualizarPacoteClienteId,
    concluirComPacote,
    estornarConclusaoAutomatica,
    listarParaConclusaoAutomatica,
    listarSiblingsEditaveisDoLote,
    reservarNumeroNoPacoteOportunistaNaTransacao,
} from './agendamento.repository';

vi.mock('../lib/prisma', () => ({
    default: {
        $transaction: vi.fn(),
        agendamento: { findMany: vi.fn() },
    },
}));

vi.mock('./pacote.repository', () => ({
    bloquearParaCriacaoNaTransacao: vi.fn(),
}));

vi.mock('./cliente.repository', () => ({
    bloquearParaCriacaoDePacote: vi.fn(),
}));

import * as pacoteRepository from './pacote.repository';
import * as clienteRepository from './cliente.repository';

type PrismaTransactionMock = {
    $queryRaw: ReturnType<typeof vi.fn>;
    pacoteClienteServico: {
        updateMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findMany: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        createMany: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
    };
    pacoteCliente: {
        findUnique: ReturnType<typeof vi.fn>;
        findFirst: ReturnType<typeof vi.fn>;
        createMany: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
        findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
    agendamento: {
        count: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        updateMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        findUniqueOrThrow: ReturnType<typeof vi.fn>;
    };
};

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function configurarTransacao(saldoExistente: { id: string } | null) {
    const tx: PrismaTransactionMock = {
        $queryRaw: vi.fn(),
        pacoteClienteServico: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            findUnique: vi.fn().mockResolvedValue(saldoExistente),
            findMany: vi
                .fn()
                .mockResolvedValue([
                    { servicoId: 'servico-1', quantidadeTotal: 4 },
                ]),
            update: vi.fn().mockResolvedValue({}),
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
            count: vi.fn().mockResolvedValue(1),
        },
        pacoteCliente: {
            findUnique: vi.fn().mockResolvedValue({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            }),
            findFirst: vi.fn().mockResolvedValue(null),
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUniqueOrThrow: vi
                .fn()
                .mockResolvedValue({ id: 'pacote-cliente-1', status: 'ATIVO' }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            update: vi.fn().mockResolvedValue({
                id: 'pacote-cliente-1',
                status: 'ATIVO',
            }),
        },
        agendamento: {
            count: vi.fn().mockResolvedValue(0),
            update: vi.fn().mockResolvedValue({ id: 'agendamento-1' }),
            updateMany: vi.fn().mockResolvedValue({ count: 1 }),
            findUnique: vi
                .fn()
                .mockResolvedValue({ status: StatusAgendamento.AGENDADO }),
            findUniqueOrThrow: vi
                .fn()
                .mockResolvedValue({ id: 'agendamento-1' }),
        },
    };
    tx.$queryRaw.mockResolvedValue([
        { id: 'saldo-1', quantidadeRestante: saldoExistente ? 0 : 1 },
    ]);

    transaction.mockImplementation(async (callback) => callback(tx));
    return tx;
}

function configurarEstorno(
    tx: PrismaTransactionMock,
    renovacao: { id: string; status: StatusPacoteCliente } | null,
    saldosRenovacao: {
        quantidadeTotal: number;
        quantidadeRestante: number;
    }[] = [],
    agendamentosRenovacao = 0,
    clienteIdAgendamento = 'cliente-1',
) {
    tx.agendamento.findUnique.mockResolvedValueOnce({
        clienteId: 'cliente-1',
    });
    tx.pacoteCliente.findUnique.mockReset();
    tx.pacoteCliente.findUnique.mockResolvedValueOnce(renovacao);
    tx.$queryRaw
        .mockReset()
        .mockResolvedValueOnce([{ id: 'cliente-1' }])
        .mockResolvedValueOnce([
            {
                clienteId: clienteIdAgendamento,
                pacoteClienteId: 'pacote-cliente-1',
                servicoId: 'servico-1',
                status: StatusAgendamento.AGENDADO,
                concluido: true,
                concluidoEm: new Date('2026-07-20T11:00:00Z'),
                concluidoPor: OrigemConclusaoAgendamento.AUTOMATICO,
            },
        ]);

    if (renovacao?.status === StatusPacoteCliente.ATIVO) {
        tx.$queryRaw.mockResolvedValueOnce(saldosRenovacao);
        tx.agendamento.count.mockResolvedValueOnce(agendamentosRenovacao);
        tx.pacoteCliente.findUnique.mockResolvedValueOnce({
            status: renovacao.status,
        });
    }

    if (renovacao?.status !== StatusPacoteCliente.FINALIZADO) {
        tx.$queryRaw.mockResolvedValueOnce([
            {
                id: 'saldo-1',
                quantidadeTotal: 4,
                usosAnteriores: 0,
                quantidadeRestante: 0,
            },
        ]);
    }
}

describe('agendamento.repository.concluirComPacote', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('retorna 404 quando PacoteClienteServico não existe para pacoteClienteId e servicoId', async () => {
        const tx = configurarTransacao(null);
        tx.$queryRaw.mockResolvedValueOnce([]);

        await expect(
            concluirComPacote(
                'agendamento-1',
                'pacote-cliente-1',
                'servico-1',
                OrigemConclusaoAgendamento.MANUAL,
                new Date('2026-07-20T12:00:00Z'),
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não encontrado.',
            statusCode: 404,
        });

        expect(tx.agendamento.updateMany).toHaveBeenCalledTimes(1);
        expect(tx.pacoteClienteServico.update).not.toHaveBeenCalled();
    });

    it('retorna 400 quando PacoteClienteServico existe com quantidadeRestante zerada', async () => {
        const tx = configurarTransacao({ id: 'pacote-cliente-servico-1' });
        tx.$queryRaw.mockResolvedValueOnce([
            { id: 'saldo-1', quantidadeRestante: 0 },
        ]);

        await expect(
            concluirComPacote(
                'agendamento-1',
                'pacote-cliente-1',
                'servico-1',
                OrigemConclusaoAgendamento.MANUAL,
                new Date('2026-07-20T12:00:00Z'),
            ),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente está esgotado.',
            statusCode: 400,
        });

        expect(tx.pacoteClienteServico.update).not.toHaveBeenCalled();
    });

    it('job ignora saldo esgotado sem debitar ou manter claim', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw.mockResolvedValueOnce([
            { id: 'saldo-1', quantidadeRestante: 0 },
        ]);

        await expect(
            concluirComPacote(
                'agendamento-1',
                'pacote-cliente-1',
                'servico-1',
                OrigemConclusaoAgendamento.AUTOMATICO,
                new Date('2026-07-20T12:00:00Z'),
            ),
        ).resolves.toMatchObject({ estado: 'SALDO_ESGOTADO' });

        expect(tx.agendamento.updateMany).toHaveBeenCalledTimes(1);
        expect(tx.pacoteClienteServico.update).not.toHaveBeenCalled();
    });

    it('bloqueia estorno antes de alterar dados quando existe outro pacote ativo', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(tx, null);
        tx.pacoteCliente.findFirst.mockResolvedValue({ id: 'outro-pacote' });

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).rejects.toMatchObject({
            message:
                'Não é possível estornar: cliente já possui outro pacote ativo.',
            statusCode: 409,
        });

        expect(tx.agendamento.updateMany).not.toHaveBeenCalled();
        expect(tx.pacoteClienteServico.update).not.toHaveBeenCalled();
    });

    it('devolve crédito e reativa pacote finalizado ao estornar', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(tx, null);
        tx.agendamento.findUniqueOrThrow.mockResolvedValue({
            id: 'agendamento-1',
            status: StatusAgendamento.CANCELADO,
            concluido: false,
        });

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).resolves.toMatchObject({
            id: 'agendamento-1',
            status: StatusAgendamento.CANCELADO,
            concluido: false,
        });

        expect(tx.agendamento.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    status: StatusAgendamento.CANCELADO,
                    concluido: false,
                    concluidoEm: null,
                    concluidoPor: null,
                    numeroNoPacote: null,
                }),
            }),
        );
        expect(tx.pacoteClienteServico.update).toHaveBeenCalledWith({
            where: { id: 'saldo-1' },
            data: { quantidadeRestante: { increment: 1 } },
        });
        expect(tx.pacoteCliente.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'pacote-cliente-1',
                    status: 'FINALIZADO',
                },
                data: { status: 'ATIVO' },
            }),
        );

        const sql = tx.$queryRaw.mock.calls.map(
            ([query]) => (query as { sql: string }).sql,
        );
        expect(sql[0]).toContain('FROM "clientes"');
        expect(sql[1]).toContain('FROM "agendamentos"');
        expect(sql[2]).toContain('FROM "pacotes_clientes_servicos"');
    });

    it('cancela renovação ativa sem uso e reativa ciclo anterior', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(
            tx,
            { id: 'renovacao-1', status: StatusPacoteCliente.ATIVO },
            [{ quantidadeTotal: 3, quantidadeRestante: 3 }],
        );

        await estornarConclusaoAutomatica(
            'agendamento-1',
            new Date('2026-07-20T12:00:00Z'),
            48,
        );

        expect(tx.pacoteCliente.updateMany).toHaveBeenNthCalledWith(1, {
            where: {
                id: 'renovacao-1',
                renovadoDeId: 'pacote-cliente-1',
                status: StatusPacoteCliente.ATIVO,
            },
            data: {
                status: StatusPacoteCliente.CANCELADO,
                renovadoDeId: null,
            },
        });
        expect(tx.pacoteCliente.updateMany).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                where: {
                    id: 'pacote-cliente-1',
                    status: StatusPacoteCliente.FINALIZADO,
                },
                data: { status: StatusPacoteCliente.ATIVO },
            }),
        );

        const sql = tx.$queryRaw.mock.calls.map(
            ([query]) => (query as { sql: string }).sql,
        );
        expect(sql[0]).toContain('FROM "clientes"');
        expect(sql[1]).toContain('FROM "agendamentos"');
        expect(sql[2]).toContain('FROM "pacotes_clientes_servicos"');
        expect(sql[3]).toContain('FROM "pacotes_clientes_servicos"');
    });

    it('bloqueia estorno quando renovação consumiu saldo', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(
            tx,
            { id: 'renovacao-1', status: StatusPacoteCliente.ATIVO },
            [{ quantidadeTotal: 3, quantidadeRestante: 2 }],
        );

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).rejects.toMatchObject({
            message:
                'Não é possível estornar: a renovação já possui uso ou agendamento vinculado não cancelado. Desfaça a renovação antes de estornar.',
            statusCode: 409,
        });
        expect(tx.agendamento.updateMany).not.toHaveBeenCalled();
    });

    it('bloqueia estorno quando renovação tem agendamento não cancelado', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(
            tx,
            { id: 'renovacao-1', status: StatusPacoteCliente.ATIVO },
            [{ quantidadeTotal: 3, quantidadeRestante: 3 }],
            1,
        );

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.agendamento.count).toHaveBeenCalledWith({
            where: {
                pacoteClienteId: 'renovacao-1',
                status: { not: StatusAgendamento.CANCELADO },
            },
        });
    });

    it('permite renovação cancelada e preserva renovadoDeId', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(tx, {
            id: 'renovacao-1',
            status: StatusPacoteCliente.CANCELADO,
        });

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).resolves.toBeDefined();

        expect(tx.pacoteCliente.updateMany).toHaveBeenCalledOnce();
        expect(tx.pacoteCliente.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'pacote-cliente-1',
                    status: StatusPacoteCliente.FINALIZADO,
                },
            }),
        );
    });

    it('bloqueia estorno quando renovação está finalizada', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(tx, {
            id: 'renovacao-1',
            status: StatusPacoteCliente.FINALIZADO,
        });

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).rejects.toMatchObject({
            message: 'Não é possível estornar: a renovação já foi finalizada.',
            statusCode: 409,
        });
        expect(tx.pacoteCliente.updateMany).not.toHaveBeenCalled();
    });

    it('aborta se cliente do agendamento mudou após pré-leitura', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        configurarEstorno(tx, null, [], 0, 'cliente-2');

        await expect(
            estornarConclusaoAutomatica(
                'agendamento-1',
                new Date('2026-07-20T12:00:00Z'),
                48,
            ),
        ).rejects.toMatchObject({
            message:
                'Não é possível estornar: cliente do agendamento mudou durante a operação. Tente novamente.',
            statusCode: 409,
        });
        expect(tx.pacoteCliente.findUnique).not.toHaveBeenCalled();
    });
});

describe('agendamento.repository.concluirComPacote renovação automática', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('RENOVACAO_AUTOMATICA_ENABLED', 'false');
        vi.mocked(
            pacoteRepository.bloquearParaCriacaoNaTransacao,
        ).mockResolvedValue({ id: 'pacote-1', arquivadoEm: null });
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('renova com snapshot de serviços e zera usos anteriores', async () => {
        vi.stubEnv('RENOVACAO_AUTOMATICA_ENABLED', 'true');
        const tx = configurarTransacao({ id: 'saldo-1' });
        const concluidoEm = new Date('2026-07-20T12:00:00Z');
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([{ id: 'cliente-1' }])
            .mockResolvedValueOnce([{ id: 'saldo-1', quantidadeRestante: 1 }]);
        tx.pacoteCliente.findUnique
            .mockResolvedValueOnce({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            })
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'pacote-cliente-novo' });
        tx.pacoteClienteServico.findMany.mockResolvedValue([
            {
                servicoId: 'servico-1',
                quantidadeTotal: 4,
                usosAnteriores: 3,
            },
            {
                servicoId: 'servico-2',
                quantidadeTotal: 2,
                usosAnteriores: 1,
            },
        ]);
        tx.pacoteClienteServico.count.mockResolvedValue(0);

        const resultado = await concluirComPacote(
            'agendamento-1',
            'pacote-cliente-antigo',
            'servico-1',
            OrigemConclusaoAgendamento.MANUAL,
            concluidoEm,
        );

        expect(resultado.renovacao).toEqual({
            criada: true,
            pacoteClienteId: 'pacote-cliente-novo',
        });
        expect(tx.pacoteCliente.createMany).toHaveBeenCalledWith({
            data: [
                {
                    clienteId: 'cliente-1',
                    pacoteId: 'pacote-1',
                    renovadoDeId: 'pacote-cliente-antigo',
                    dataInicio: concluidoEm,
                    status: 'ATIVO',
                },
            ],
            skipDuplicates: true,
        });
        expect(
            pacoteRepository.bloquearParaCriacaoNaTransacao,
        ).toHaveBeenCalledWith(tx, 'pacote-1');
        expect(tx.pacoteClienteServico.createMany).toHaveBeenCalledWith({
            data: [
                {
                    pacoteClienteId: 'pacote-cliente-novo',
                    servicoId: 'servico-1',
                    quantidadeTotal: 4,
                    usosAnteriores: 0,
                    quantidadeRestante: 4,
                },
                {
                    pacoteClienteId: 'pacote-cliente-novo',
                    servicoId: 'servico-2',
                    quantidadeTotal: 2,
                    usosAnteriores: 0,
                    quantidadeRestante: 2,
                },
            ],
        });
        const sql = tx.$queryRaw.mock.calls.map(
            ([query]) => (query as { sql: string }).sql,
        );
        expect(sql[0]).toContain('FROM "clientes"');
        expect(sql[1]).toContain('FROM "pacotes_clientes_servicos"');
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.agendamento.updateMany.mock.invocationCallOrder[0],
        );
    });

    it.each([
        ['flag desligada', false, null, null, 'FLAG_DESLIGADA'],
        [
            'outro vínculo ativo',
            true,
            { id: 'ativo' },
            null,
            'OUTRO_PACOTE_ATIVO',
        ],
        ['sem serviços', true, null, [], 'CICLO_SEM_SERVICOS'],
        ['já renovado', true, null, null, 'JA_RENOVADO'],
    ])(
        '%s não impede conclusão nem cria ciclo',
        async (_, habilitada, ativo, servicos, motivo) => {
            vi.stubEnv(
                'RENOVACAO_AUTOMATICA_ENABLED',
                habilitada ? 'true' : 'false',
            );
            const tx = configurarTransacao({ id: 'saldo-1' });
            tx.$queryRaw
                .mockReset()
                .mockResolvedValueOnce([{ id: 'cliente-1' }])
                .mockResolvedValueOnce([
                    { id: 'saldo-1', quantidadeRestante: 1 },
                ]);
            tx.pacoteCliente.findUnique.mockResolvedValue({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            });
            if (motivo === 'JA_RENOVADO') {
                tx.pacoteCliente.findUnique
                    .mockResolvedValueOnce({
                        clienteId: 'cliente-1',
                        pacoteId: 'pacote-1',
                    })
                    .mockResolvedValueOnce({ id: 'renovacao-existente' });
            }
            tx.pacoteCliente.findFirst.mockResolvedValue(ativo);
            tx.pacoteClienteServico.findMany.mockResolvedValue(
                servicos ?? [{ servicoId: 'servico-1', quantidadeTotal: 4 }],
            );
            tx.pacoteCliente.createMany.mockResolvedValue({
                count: motivo === 'JA_RENOVADO' ? 0 : 1,
            });
            tx.pacoteClienteServico.count.mockResolvedValue(0);

            const resultado = await concluirComPacote(
                'agendamento-1',
                'pacote-cliente-antigo',
                'servico-1',
                OrigemConclusaoAgendamento.MANUAL,
                new Date('2026-07-20T12:00:00Z'),
            );

            expect(resultado.estado).toBe('CONCLUIDO');
            expect(resultado.renovacao).toEqual({ criada: false, motivo });
            expect(tx.pacoteCliente.createMany).toHaveBeenCalledTimes(
                motivo === 'FLAG_DESLIGADA' ||
                    motivo === 'OUTRO_PACOTE_ATIVO' ||
                    motivo === 'CICLO_SEM_SERVICOS' ||
                    motivo === 'JA_RENOVADO'
                    ? 0
                    : 1,
            );
        },
    );

    it('conclui ciclo arquivado sem renovar e registra evento seguro', async () => {
        vi.stubEnv('RENOVACAO_AUTOMATICA_ENABLED', 'true');
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([{ id: 'cliente-1' }])
            .mockResolvedValueOnce([{ id: 'saldo-1', quantidadeRestante: 1 }]);
        tx.pacoteCliente.findUnique
            .mockResolvedValueOnce({
                clienteId: 'cliente-1',
                pacoteId: 'pacote-1',
            })
            .mockResolvedValueOnce(null);
        tx.pacoteClienteServico.findMany.mockResolvedValue([
            { servicoId: 'servico-1', quantidadeTotal: 4 },
        ]);
        tx.pacoteClienteServico.count.mockResolvedValue(0);
        tx.pacoteCliente.findUniqueOrThrow.mockResolvedValue({
            id: 'pacote-cliente-antigo',
            status: StatusPacoteCliente.FINALIZADO,
        });
        vi.mocked(
            pacoteRepository.bloquearParaCriacaoNaTransacao,
        ).mockResolvedValue({
            id: 'pacote-1',
            arquivadoEm: new Date('2026-07-01T00:00:00Z'),
        });
        const log = vi.spyOn(console, 'info').mockImplementation(() => {});

        const resultado = await concluirComPacote(
            'agendamento-1',
            'pacote-cliente-antigo',
            'servico-1',
            OrigemConclusaoAgendamento.AUTOMATICO,
            new Date('2026-07-20T12:00:00Z'),
        );

        expect(resultado.estado).toBe('CONCLUIDO');
        expect(resultado.pacoteCliente.status).toBe('FINALIZADO');
        expect(resultado.renovacao).toEqual({
            criada: false,
            motivo: 'PACOTE_ARQUIVADO',
        });
        expect(tx.pacoteCliente.createMany).not.toHaveBeenCalled();
        expect(tx.pacoteCliente.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'pacote-cliente-antigo',
                    status: StatusPacoteCliente.ATIVO,
                },
                data: { status: StatusPacoteCliente.FINALIZADO },
            }),
        );
        expect(log).toHaveBeenCalledWith(
            JSON.stringify({
                evento: 'renovacao_ignorada_pacote_arquivado',
                pacoteId: 'pacote-1',
                pacoteClienteId: 'pacote-cliente-antigo',
                quantidadeServicos: 1,
            }),
        );
        expect(JSON.stringify(log.mock.calls)).not.toContain('cliente-1');
    });

    it('flag ligada mantém conclusão normal enquanto ainda há saldo', async () => {
        vi.stubEnv('RENOVACAO_AUTOMATICA_ENABLED', 'true');
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([{ id: 'cliente-1' }])
            .mockResolvedValueOnce([{ id: 'saldo-1', quantidadeRestante: 2 }]);
        tx.pacoteClienteServico.count.mockResolvedValue(1);

        const resultado = await concluirComPacote(
            'agendamento-1',
            'pacote-cliente-antigo',
            'servico-1',
            OrigemConclusaoAgendamento.MANUAL,
            new Date('2026-07-20T12:00:00Z'),
        );

        expect(resultado.estado).toBe('CONCLUIDO');
        expect(resultado.renovacao).toEqual({
            criada: false,
            motivo: 'SALDO_RESTANTE',
        });
        expect(tx.pacoteCliente.createMany).not.toHaveBeenCalled();
    });
});

describe('agendamento.repository.atualizarUsosAnteriores', () => {
    function configurarEdicao(saldo: {
        id: string;
        quantidadeTotal: number;
        usosAnteriores: number;
        quantidadeRestante: number;
    }) {
        const tx = configurarTransacao({ id: saldo.id });
        tx.$queryRaw.mockResolvedValue([saldo]);
        tx.pacoteCliente.findUnique.mockResolvedValue({ status: 'ATIVO' });
        return tx;
    }

    it('rejeita pacote não ativo', async () => {
        const tx = configurarEdicao({
            id: 'pcs-1',
            quantidadeTotal: 4,
            usosAnteriores: 1,
            quantidadeRestante: 2,
        });
        tx.pacoteCliente.findUnique.mockResolvedValue({ status: 'FINALIZADO' });

        await expect(
            atualizarUsosAnteriores('pacote-cliente-1', 'servico-1', 2),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('rejeita valor maior ou igual ao total', async () => {
        configurarEdicao({
            id: 'pcs-1',
            quantidadeTotal: 4,
            usosAnteriores: 1,
            quantidadeRestante: 3,
        });

        await expect(
            atualizarUsosAnteriores('pacote-cliente-1', 'servico-1', 4),
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('rejeita número já ocupado por agendamento não cancelado', async () => {
        const tx = configurarEdicao({
            id: 'pcs-1',
            quantidadeTotal: 4,
            usosAnteriores: 0,
            quantidadeRestante: 4,
        });
        tx.agendamento.count.mockResolvedValue(1);

        await expect(
            atualizarUsosAnteriores('pacote-cliente-1', 'servico-1', 1),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('ajusta saldo e mantém pacote ativo no caminho feliz', async () => {
        const tx = configurarEdicao({
            id: 'pcs-1',
            quantidadeTotal: 4,
            usosAnteriores: 1,
            quantidadeRestante: 2,
        });

        await atualizarUsosAnteriores('pacote-cliente-1', 'servico-1', 2);

        expect(tx.pacoteClienteServico.update).toHaveBeenCalledWith({
            where: { id: 'pcs-1' },
            data: { usosAnteriores: 2, quantidadeRestante: 1 },
        });
        expect(tx.pacoteCliente.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'pacote-cliente-1' },
                data: { status: 'ATIVO' },
            }),
        );
    });

    it('rejeita saldo resultante fora do intervalo permitido', async () => {
        const tx = configurarEdicao({
            id: 'pcs-1',
            quantidadeTotal: 4,
            usosAnteriores: 1,
            quantidadeRestante: 4,
        });

        await expect(
            atualizarUsosAnteriores('pacote-cliente-1', 'servico-1', 0),
        ).rejects.toMatchObject({ statusCode: 409 });
        expect(tx.pacoteClienteServico.update).not.toHaveBeenCalled();
    });

    it('finaliza pacote quando edição zera todos os saldos', async () => {
        const tx = configurarEdicao({
            id: 'pcs-1',
            quantidadeTotal: 4,
            usosAnteriores: 1,
            quantidadeRestante: 2,
        });
        tx.pacoteClienteServico.count.mockResolvedValue(0);

        await atualizarUsosAnteriores('pacote-cliente-1', 'servico-1', 3);

        expect(tx.pacoteCliente.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { status: 'FINALIZADO' },
            }),
        );
    });
});

describe('ordem de locks de agendamento', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('trava agendamento antes de reservar saldo durante remarcação', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([{ id: 'agendamento-1' }])
            .mockResolvedValueOnce([{ quantidadeTotal: 4, usosAnteriores: 0 }])
            .mockResolvedValueOnce([]);

        await atualizarComNumeroNoPacote(
            'agendamento-1',
            {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                dataHoraInicio: new Date('2026-07-20T13:00:00Z'),
                dataHoraFim: new Date('2026-07-20T13:30:00Z'),
                status: StatusAgendamento.AGENDADO,
            },
            'pacote-cliente-1',
            'servico-1',
            null,
            StatusAgendamento.AGENDADO,
        );

        const sql = tx.$queryRaw.mock.calls.map(
            ([query]) => (query as { sql: string }).sql,
        );
        expect(sql[0]).toContain('FROM "agendamentos"');
        expect(sql[0]).toContain('FOR UPDATE');
        expect(sql[1]).toContain('FROM "pacotes_clientes_servicos"');
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.$queryRaw.mock.invocationCallOrder[1],
        );
        expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
            tx.agendamento.update.mock.invocationCallOrder[0],
        );
    });

    it('trava agendamento antes de reservar saldo ao vincular pacote', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([
                {
                    id: 'agendamento-1',
                    pacoteClienteId: 'pacote-cliente-antigo',
                    servicoId: 'servico-1',
                    status: StatusAgendamento.AGENDADO,
                    numeroNoPacote: null,
                },
            ])
            .mockResolvedValueOnce([{ quantidadeTotal: 4, usosAnteriores: 0 }])
            .mockResolvedValueOnce([]);

        await atualizarPacoteClienteId('agendamento-1', 'pacote-cliente-novo');

        const sql = tx.$queryRaw.mock.calls.map(
            ([query]) => (query as { sql: string }).sql,
        );
        expect(sql[0]).toContain('FROM "agendamentos"');
        expect(sql[0]).toContain('FOR UPDATE');
        expect(sql[1]).toContain('FROM "pacotes_clientes_servicos"');
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.$queryRaw.mock.invocationCallOrder[1],
        );
        expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
            tx.agendamento.update.mock.invocationCallOrder[0],
        );
    });
});

describe('agendamento.repository atualizar com pacote do catálogo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('trava cliente, agendamento, catálogo e saldo nessa ordem', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        const eventos: string[] = [];
        tx.agendamento.findUnique.mockResolvedValueOnce({
            clienteId: 'cliente-1',
        });
        vi.mocked(
            clienteRepository.bloquearParaCriacaoDePacote,
        ).mockImplementationOnce(async () => {
            eventos.push('cliente');
            return true;
        });
        tx.$queryRaw.mockImplementation(async (query) => {
            const sql = (query as { sql: string }).sql;
            if (
                sql.includes('FROM "agendamentos"') &&
                sql.includes('FOR UPDATE')
            ) {
                eventos.push('agendamento');
                return [
                    {
                        clienteId: 'cliente-1',
                        pacoteClienteId: null,
                        status: StatusAgendamento.AGENDADO,
                        concluido: false,
                    },
                ];
            }
            if (sql.includes('FROM "pacotes_clientes_servicos"')) {
                if (sql.includes('SELECT "quantidadeTotal"')) {
                    eventos.push('saldo');
                    return [{ quantidadeTotal: 4, usosAnteriores: 0 }];
                }
                return [];
            }
            return [];
        });
        vi.mocked(
            pacoteRepository.bloquearParaCriacaoNaTransacao,
        ).mockImplementationOnce(async () => {
            eventos.push('catalogo');
            return { id: 'pacote-1', arquivadoEm: null };
        });

        await atualizarComPacoteDoCatalogoNaTransacao(
            tx as never,
            'agendamento-1',
            {
                clienteId: 'cliente-1',
                servicoId: 'servico-1',
                dataHoraInicio: new Date('2026-07-20T13:00:00Z'),
                dataHoraFim: new Date('2026-07-20T13:30:00Z'),
                status: StatusAgendamento.AGENDADO,
            },
            async (txAtual) => {
                await pacoteRepository.bloquearParaCriacaoNaTransacao(
                    txAtual as never,
                    'pacote-1',
                );
                return 'pacote-cliente-1';
            },
        );

        expect(eventos).toEqual([
            'cliente',
            'agendamento',
            'catalogo',
            'saldo',
        ]);
    });

    it('rejeita com conflito se clienteId mudar entre pré-leitura e lock', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.agendamento.findUnique.mockResolvedValueOnce({
            clienteId: 'cliente-1',
        });
        vi.mocked(
            clienteRepository.bloquearParaCriacaoDePacote,
        ).mockResolvedValueOnce(true);
        tx.$queryRaw.mockReset().mockResolvedValueOnce([
            {
                clienteId: 'cliente-2',
                pacoteClienteId: null,
                status: StatusAgendamento.AGENDADO,
                concluido: false,
            },
        ]);
        const resolver = vi.fn(async () => 'pacote-cliente-1');

        await expect(
            atualizarComPacoteDoCatalogoNaTransacao(
                tx as never,
                'agendamento-1',
                {
                    clienteId: 'cliente-1',
                    servicoId: 'servico-1',
                    dataHoraInicio: new Date('2026-07-20T13:00:00Z'),
                    dataHoraFim: new Date('2026-07-20T13:30:00Z'),
                    status: StatusAgendamento.AGENDADO,
                },
                resolver,
            ),
        ).rejects.toMatchObject({
            statusCode: 409,
            message:
                'Cliente do agendamento mudou durante a edição. Tente novamente.',
        });
        expect(resolver).not.toHaveBeenCalled();
        expect(tx.agendamento.update).not.toHaveBeenCalled();
    });
});

describe('agendamento.repository reserva oportunista de pacote', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('retorna null quando não há número livre', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([{ quantidadeTotal: 1, usosAnteriores: 0 }])
            .mockResolvedValueOnce([{ numeroNoPacote: 1 }]);

        await expect(
            reservarNumeroNoPacoteOportunistaNaTransacao(
                tx as never,
                'pacote-cliente-1',
                'servico-1',
            ),
        ).resolves.toBeNull();

        expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('reserva primeiro número livre', async () => {
        const tx = configurarTransacao({ id: 'saldo-1' });
        tx.$queryRaw
            .mockReset()
            .mockResolvedValueOnce([{ quantidadeTotal: 3, usosAnteriores: 0 }])
            .mockResolvedValueOnce([{ numeroNoPacote: 1 }]);

        await expect(
            reservarNumeroNoPacoteOportunistaNaTransacao(
                tx as never,
                'pacote-cliente-1',
                'servico-1',
            ),
        ).resolves.toBe(2);
    });

    it('propaga erro quando linha de saldo não existe', async () => {
        const tx = configurarTransacao(null);
        tx.$queryRaw.mockReset().mockResolvedValueOnce([]);

        await expect(
            reservarNumeroNoPacoteOportunistaNaTransacao(
                tx as never,
                'pacote-cliente-1',
                'servico-1',
            ),
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('agendamento.repository.listarParaConclusaoAutomatica', () => {
    it('filtra vínculos não ativos antes de ordenar e limitar candidatos', async () => {
        const findMany = vi.mocked(prisma.agendamento.findMany);
        findMany.mockResolvedValue([
            {
                id: 'ativo-mais-antigo',
                pacoteClienteId: 'pc-ativo-1',
                servicoId: 'servico-1',
            },
        ] as never);

        await expect(
            listarParaConclusaoAutomatica(
                new Date('2026-07-20T00:00:00Z'),
                new Date('2026-07-21T00:00:00Z'),
                1,
            ),
        ).resolves.toEqual([
            {
                id: 'ativo-mais-antigo',
                pacoteClienteId: 'pc-ativo-1',
                servicoId: 'servico-1',
            },
        ]);
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    pacoteCliente: { is: { status: 'ATIVO' } },
                }),
                orderBy: [{ dataHoraFim: 'asc' }, { id: 'asc' }],
                take: 1,
            }),
        );
    });
});

describe('agendamento.repository.listarSiblingsEditaveisDoLote', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('limita irmãos aos que já terminaram quando recebe horário de corte', async () => {
        const corte = new Date('2026-07-20T12:00:00Z');
        vi.mocked(prisma.agendamento.findMany).mockResolvedValue([] as never);

        await listarSiblingsEditaveisDoLote('lote-1', 'origem-1', corte);

        expect(prisma.agendamento.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    loteId: 'lote-1',
                    dataHoraFim: { lte: corte },
                }),
            }),
        );
    });
});
