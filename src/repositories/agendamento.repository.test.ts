import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import {
    atualizarUsosAnteriores,
    concluirComPacote,
} from './agendamento.repository';

vi.mock('../lib/prisma', () => ({
    default: {
        $transaction: vi.fn(),
    },
}));

type PrismaTransactionMock = {
    $queryRaw: ReturnType<typeof vi.fn>;
    pacoteClienteServico: {
        updateMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
    };
    pacoteCliente: {
        findUnique: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
    };
    agendamento: {
        count: ReturnType<typeof vi.fn>;
    };
};

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function configurarTransacao(saldoExistente: { id: string } | null) {
    const tx: PrismaTransactionMock = {
        $queryRaw: vi.fn(),
        pacoteClienteServico: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            findUnique: vi.fn().mockResolvedValue(saldoExistente),
            update: vi.fn(),
            count: vi.fn().mockResolvedValue(1),
        },
        pacoteCliente: {
            findUnique: vi.fn(),
            update: vi.fn().mockResolvedValue({
                id: 'pacote-cliente-1',
                status: 'ATIVO',
            }),
        },
        agendamento: {
            count: vi.fn().mockResolvedValue(0),
        },
    };

    transaction.mockImplementation(async (callback) => callback(tx));
    return tx;
}

describe('agendamento.repository.concluirComPacote', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('retorna 404 quando PacoteClienteServico não existe para pacoteClienteId e servicoId', async () => {
        const tx = configurarTransacao(null);

        await expect(
            concluirComPacote('agendamento-1', 'pacote-cliente-1', 'servico-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não encontrado.',
            statusCode: 404,
        });

        expect(tx.pacoteClienteServico.findUnique).toHaveBeenCalledWith({
            where: {
                pacoteClienteId_servicoId: {
                    pacoteClienteId: 'pacote-cliente-1',
                    servicoId: 'servico-1',
                },
            },
            select: { id: true },
        });
    });

    it('retorna 400 quando PacoteClienteServico existe com quantidadeRestante zerada', async () => {
        const tx = configurarTransacao({ id: 'pacote-cliente-servico-1' });

        await expect(
            concluirComPacote('agendamento-1', 'pacote-cliente-1', 'servico-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente está esgotado.',
            statusCode: 400,
        });

        expect(tx.pacoteClienteServico.findUnique).toHaveBeenCalled();
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
