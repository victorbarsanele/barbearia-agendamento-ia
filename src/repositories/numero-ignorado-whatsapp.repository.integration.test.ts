import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import { PrismaNumeroIgnoradoWhatsAppRepository } from './numero-ignorado-whatsapp.repository';

const telefone = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`;

afterEach(async () => {
    await prisma.numeroIgnoradoWhatsApp.deleteMany({ where: { telefone } });
});

describe('PrismaNumeroIgnoradoWhatsAppRepository integration', () => {
    it('persists canonical phone and enforces unique constraint with P2002', async () => {
        const repository = new PrismaNumeroIgnoradoWhatsAppRepository(prisma);
        await repository.criar({ telefone, rotulo: 'Teste' });

        await expect(repository.existePorTelefone(telefone)).resolves.toBe(
            true,
        );
        await expect(
            repository.criar({ telefone, rotulo: 'Duplicado' }),
        ).rejects.toMatchObject({ code: 'P2002' });
    });
});
