import { StatusPacoteCliente } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import { cancelarSeAtivo } from './pacoteCliente.repository';

vi.mock('../lib/prisma', () => ({
    default: { $transaction: vi.fn() },
}));

const transaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

describe('pacoteCliente.repository.cancelarSeAtivo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('não atualiza vínculo que deixou de estar ativo', async () => {
        const tx = {
            pacoteCliente: {
                updateMany: vi.fn().mockResolvedValue({ count: 0 }),
                findUniqueOrThrow: vi.fn(),
            },
        };
        transaction.mockImplementation(async (operation) => operation(tx));

        await expect(cancelarSeAtivo('pacote-cliente-1')).resolves.toBeNull();

        expect(tx.pacoteCliente.updateMany).toHaveBeenCalledWith({
            where: {
                id: 'pacote-cliente-1',
                status: StatusPacoteCliente.ATIVO,
            },
            data: { status: StatusPacoteCliente.CANCELADO },
        });
        expect(tx.pacoteCliente.findUniqueOrThrow).not.toHaveBeenCalled();
    });
});
