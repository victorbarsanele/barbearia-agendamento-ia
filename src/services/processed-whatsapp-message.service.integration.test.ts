import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import { registrarMensagemProcessada } from './processed-whatsapp-message.service';

const provider = 'evolution';
const messageId = `integration-${Date.now()}-${Math.random().toString(36).slice(2)}`;

afterEach(async () => {
    await prisma.mensagemWhatsAppProcessada.deleteMany({
        where: { provedor: provider, idMensagem: messageId },
    });
});

describe('registrarMensagemProcessada', () => {
    it('retorna true na primeira inserção e false na duplicata', async () => {
        await expect(
            registrarMensagemProcessada(provider, messageId),
        ).resolves.toBe(true);
        await expect(
            registrarMensagemProcessada(provider, messageId),
        ).resolves.toBe(false);
    });

    it('permite somente uma primeira inserção concorrente', async () => {
        const results = await Promise.all([
            registrarMensagemProcessada(provider, messageId),
            registrarMensagemProcessada(provider, messageId),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
    });
});
