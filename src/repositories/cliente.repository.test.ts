import { beforeEach, describe, expect, it, vi } from 'vitest';
import prisma from '../lib/prisma';
import { listarPaginado } from './cliente.repository';

vi.mock('../lib/prisma', () => ({
    default: {
        cliente: {
            findMany: vi.fn(),
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
            await listarPaginado({ search, skip: 0, take: 10 });

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
