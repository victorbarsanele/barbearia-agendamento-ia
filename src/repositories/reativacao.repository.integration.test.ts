import { StatusReativacaoEnvio } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import { PrismaReativacaoRepository } from './reativacao.repository';

const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PHONE_SUFFIX = RUN_ID.replace(/\D/g, '').slice(-8).padStart(8, '0');

describe('PrismaReativacaoRepository integração', () => {
    const repository = new PrismaReativacaoRepository(prisma);
    let clienteId: string | null = null;

    beforeEach(async () => {
        const cliente = await prisma.cliente.create({
            data: {
                nome: `Cliente reativacao ${RUN_ID}`,
                telefone: `55119${PHONE_SUFFIX}`,
            },
        });
        clienteId = cliente.id;
    });

    afterEach(async () => {
        if (!clienteId) {
            return;
        }
        await prisma.reativacaoEnvio.deleteMany({ where: { clienteId } });
        await prisma.cliente.deleteMany({ where: { id: clienteId } });
        clienteId = null;
    });

    it('serializa reservas concorrentes e cria uma tentativa', async () => {
        const agora = new Date();
        const resultados = await Promise.all([
            repository.reservarEnvioReativacao(clienteId!, agora),
            repository.reservarEnvioReativacao(clienteId!, agora),
        ]);

        expect(resultados.filter((resultado) => resultado.ok)).toHaveLength(1);
        expect(resultados.filter((resultado) => !resultado.ok)).toMatchObject([
            { motivo: 'COOLDOWN' },
        ]);
        expect(
            await prisma.reativacaoEnvio.count({
                where: { clienteId: clienteId! },
            }),
        ).toBe(1);
    });

    it('registra opt-out idempotente e bloqueia reserva', async () => {
        const primeiroOptOut = new Date('2026-10-01T12:00:00.000Z');
        await repository.registrarOptOutMarketing(clienteId!, primeiroOptOut);
        await repository.registrarOptOutMarketing(
            clienteId!,
            new Date('2026-10-02T12:00:00.000Z'),
        );

        expect(
            (
                await prisma.cliente.findUnique({
                    where: { id: clienteId! },
                    select: { optOutMarketingEm: true },
                })
            )?.optOutMarketingEm,
        ).toEqual(primeiroOptOut);
        await expect(
            repository.reservarEnvioReativacao(clienteId!, new Date()),
        ).resolves.toEqual({ ok: false, motivo: 'OPT_OUT' });
    });

    it('bloqueia dentro do cooldown e libera depois de falha', async () => {
        const agora = new Date('2026-10-01T12:00:00.000Z');
        const reserva = await repository.reservarEnvioReativacao(
            clienteId!,
            agora,
        );
        expect(reserva.ok).toBe(true);
        if (!reserva.ok) {
            return;
        }

        await expect(
            repository.reservarEnvioReativacao(
                clienteId!,
                new Date('2026-10-02T12:00:00.000Z'),
            ),
        ).resolves.toMatchObject({ motivo: 'COOLDOWN' });

        await repository.marcarEnvioFalhou(reserva.envioId, 'falha simulada');
        const novaReserva = await repository.reservarEnvioReativacao(
            clienteId!,
            new Date('2026-10-02T12:00:00.000Z'),
        );
        expect(novaReserva.ok).toBe(true);
    });

    it('retorna a última tentativa por cliente', async () => {
        const reserva = await repository.reservarEnvioReativacao(
            clienteId!,
            new Date('2026-10-01T12:00:00.000Z'),
        );
        expect(reserva.ok).toBe(true);
        if (!reserva.ok) {
            return;
        }

        await repository.marcarEnvioAceito(reserva.envioId, 'ycloud-123');
        const ultimas = await repository.buscarUltimasReativacoesPorClientes([
            clienteId!,
        ]);

        expect(ultimas.get(clienteId!)).toMatchObject({
            id: reserva.envioId,
            status: StatusReativacaoEnvio.ACEITA,
            ycloudMessageId: 'ycloud-123',
        });
    });

    it('distingue cliente inexistente', async () => {
        await expect(
            repository.reservarEnvioReativacao('cliente-ausente', new Date()),
        ).resolves.toEqual({
            ok: false,
            motivo: 'CLIENTE_NAO_ENCONTRADO',
        });
    });
});
