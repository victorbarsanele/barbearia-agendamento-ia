import { randomUUID } from 'node:crypto';
import {
    StatusAgendamento,
    StatusLembreteAgendamentoEnvio,
} from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import { PrismaLembreteAgendamentoRepository } from './lembrete-agendamento.repository';

const FUTURO = new Date('2099-01-01T15:00:00.000Z');

describe('PrismaLembreteAgendamentoRepository integração', () => {
    let repository: PrismaLembreteAgendamentoRepository;
    let clienteId: string | undefined;
    let servicoId: string | undefined;
    let agendamentoId: string | undefined;
    let telefone = '';

    beforeEach(async () => {
        const sufixo = randomUUID().replace(/-/g, '').slice(0, 12);
        const sufixoTelefone = String(
            Number.parseInt(sufixo.slice(0, 8), 16) % 100_000_000,
        ).padStart(8, '0');
        telefone = `55119${sufixoTelefone}`;
        repository = new PrismaLembreteAgendamentoRepository(prisma);

        const cliente = await prisma.cliente.create({
            data: { nome: `Lembrete integração ${sufixo}`, telefone },
        });
        clienteId = cliente.id;

        const servico = await prisma.servico.create({
            data: {
                nome: `Serviço lembrete ${sufixo}`,
                duracaoMinutos: 30,
            },
        });
        servicoId = servico.id;

        const agendamento = await prisma.agendamento.create({
            data: {
                clienteId,
                servicoId,
                dataHoraInicio: FUTURO,
                dataHoraFim: new Date(FUTURO.getTime() + 30 * 60_000),
                status: StatusAgendamento.AGENDADO,
            },
        });
        agendamentoId = agendamento.id;
    });

    afterEach(async () => {
        if (agendamentoId) {
            await prisma.contextoRemarcacao.deleteMany({
                where: { agendamentoId },
            });
            await prisma.lembreteAgendamentoEnvio.deleteMany({
                where: { agendamentoId },
            });
            await prisma.agendamento.deleteMany({
                where: { id: agendamentoId },
            });
        }
        if (clienteId) {
            await prisma.cliente.deleteMany({ where: { id: clienteId } });
        }
        if (servicoId) {
            await prisma.servico.deleteMany({ where: { id: servicoId } });
        }

        clienteId = undefined;
        servicoId = undefined;
        agendamentoId = undefined;
    });

    it('permite exatamente uma reserva entre cinco chamadas concorrentes', async () => {
        const reservas = await Promise.all(
            Array.from({ length: 5 }, () =>
                repository.reservar(agendamentoId!, new Date()),
            ),
        );

        expect(reservas.filter((reserva) => reserva.ok)).toHaveLength(1);
        expect(reservas.filter((reserva) => !reserva.ok)).toHaveLength(4);
        expect(
            await prisma.lembreteAgendamentoEnvio.count({
                where: {
                    agendamentoId,
                    status: StatusLembreteAgendamentoEnvio.PENDENTE,
                },
            }),
        ).toBe(1);
    });

    it('permite nova reserva após FALHOU e rejeita ACEITO ou PENDENTE', async () => {
        const primeiraReserva = await repository.reservar(
            agendamentoId!,
            new Date(),
        );
        expect(primeiraReserva.ok).toBe(true);
        if (!primeiraReserva.ok) return;

        expect(
            await repository.reservar(agendamentoId!, new Date()),
        ).toMatchObject({ ok: false, motivo: 'LEMBRETE_PENDENTE' });

        await prisma.lembreteAgendamentoEnvio.update({
            where: { id: primeiraReserva.envioId },
            data: { status: StatusLembreteAgendamentoEnvio.FALHOU },
        });
        const segundaReserva = await repository.reservar(
            agendamentoId!,
            new Date(),
        );
        expect(segundaReserva.ok).toBe(true);
        if (!segundaReserva.ok) return;

        await prisma.lembreteAgendamentoEnvio.update({
            where: { id: segundaReserva.envioId },
            data: {
                status: StatusLembreteAgendamentoEnvio.ACEITO,
                providerMessageId: `ycloud-${randomUUID()}`,
                aceitoEm: new Date(),
            },
        });
        expect(
            await repository.reservar(agendamentoId!, new Date()),
        ).toMatchObject({ ok: false, motivo: 'LEMBRETE_JA_ENVIADO' });
    });

    it('consome contexto de remarcação uma vez entre cinco chamadas concorrentes', async () => {
        const agora = new Date();
        const registrado = await repository.registrarContextoRemarcacao(
            telefone,
            agendamentoId!,
            new Date(agora.getTime() + 24 * 60 * 60_000),
            agora,
        );
        expect(registrado).toBe(true);

        const contextos = await Promise.all(
            Array.from({ length: 5 }, () =>
                repository.consumirContextoRemarcacao(telefone, agora),
            ),
        );
        expect(contextos.filter(Boolean)).toHaveLength(1);
    });

    it('não retorna contexto expirado nem contexto de outro telefone', async () => {
        const agora = new Date();
        await repository.registrarContextoRemarcacao(
            telefone,
            agendamentoId!,
            new Date(agora.getTime() - 24 * 60 * 60_000 - 1),
            agora,
        );
        await expect(
            repository.consumirContextoRemarcacao(telefone, agora),
        ).resolves.toBeNull();

        await repository.registrarContextoRemarcacao(
            telefone,
            agendamentoId!,
            new Date(agora.getTime() + 24 * 60 * 60_000),
            agora,
        );
        await expect(
            repository.consumirContextoRemarcacao(
                `55118${String(
                    Number.parseInt(
                        randomUUID().replace(/-/g, '').slice(0, 8),
                        16,
                    ) % 100_000_000,
                ).padStart(8, '0')}`,
                agora,
            ),
        ).resolves.toBeNull();
    });
});
