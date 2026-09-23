import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import { concluirComPacote } from './agendamento.repository';

vi.mock('../lib/prisma', () => ({
    default: {
        $transaction: vi.fn(),
    },
}));

type PrismaTransactionMock = {
    pacoteClienteServico: {
        updateMany: ReturnType<typeof vi.fn>;
        findUnique: ReturnType<typeof vi.fn>;
    };
};

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

function configurarTransacao(saldoExistente: { id: string } | null) {
    const tx: PrismaTransactionMock = {
        pacoteClienteServico: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            findUnique: vi.fn().mockResolvedValue(saldoExistente),
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
