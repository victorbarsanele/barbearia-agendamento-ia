import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
    InMemoryPendingAgendamentoRepository,
    PrismaPendingAgendamentoRepository,
} from './pending-agendamento.repository';

const baseDraft = {
    telefoneSessao: '5519999999999',
    nomeCliente: 'João Silva',
    telefoneCliente: '5519999999999',
    servicoId: 'servico-1',
    dataHoraInicio: new Date('2026-10-20T13:00:00-03:00'),
    mensagemCriacaoId: 'message-1',
    expiraEm: new Date('2026-10-20T12:10:00-03:00'),
};

describe('InMemoryPendingAgendamentoRepository', () => {
    it('sobrescreve rascunho por telefone e consome somente em mensagem posterior', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);
        await repository.salvar({
            ...baseDraft,
            nomeCliente: 'Maria Silva',
            mensagemCriacaoId: 'message-2',
        });

        await expect(
            repository.consumir(
                baseDraft.telefoneSessao,
                'message-2',
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.toBeNull();

        await expect(
            repository.consumir(
                baseDraft.telefoneSessao,
                'message-3',
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.toMatchObject({ nomeCliente: 'Maria Silva' });
    });

    it('não consome rascunho expirado', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);

        await expect(
            repository.consumir(
                baseDraft.telefoneSessao,
                'message-2',
                new Date('2026-10-20T12:10:00-03:00'),
            ),
        ).resolves.toBeNull();
    });

    it('permite somente um consumo', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);

        const first = await repository.consumir(
            baseDraft.telefoneSessao,
            'message-2',
            new Date('2026-10-20T12:05:00-03:00'),
        );
        const second = await repository.consumir(
            baseDraft.telefoneSessao,
            'message-3',
            new Date('2026-10-20T12:05:00-03:00'),
        );

        expect(first).not.toBeNull();
        expect(second).toBeNull();
    });

    it('lista somente rascunhos elegíveis e permite um único claim', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        const now = new Date('2026-10-20T12:10:00-03:00');
        await repository.salvar({
            ...baseDraft,
            criadoEm: new Date(now.getTime() - 10 * 60_000),
            expiraEm: new Date(now.getTime() + 20 * 60_000),
        });

        await expect(
            repository.listarElegiveisParaLembrete(
                now,
                new Date(now.getTime() - 10 * 60_000),
            ),
        ).resolves.toHaveLength(1);
        await expect(
            repository.reivindicarLembrete(baseDraft.telefoneSessao, now),
        ).resolves.toBe(true);
        await expect(
            repository.reivindicarLembrete(baseDraft.telefoneSessao, now),
        ).resolves.toBe(false);
        await expect(
            repository.listarElegiveisParaLembrete(
                now,
                new Date(now.getTime()),
            ),
        ).resolves.toHaveLength(0);
    });

    it('suprime lembretes próximos da expiração ou após o início', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        const now = new Date('2026-10-20T12:10:00-03:00');
        const createdAt = new Date(now.getTime() - 10 * 60_000);
        await repository.salvar({
            ...baseDraft,
            criadoEm: createdAt,
            expiraEm: new Date(now.getTime() + 2 * 60_000),
        });
        await repository.salvar({
            ...baseDraft,
            telefoneSessao: '5519888888888',
            expiraEm: new Date(now.getTime() + 5 * 60_000),
            dataHoraInicio: new Date(now.getTime()),
        });

        await expect(
            repository.listarElegiveisParaLembrete(
                now,
                new Date(now.getTime()),
            ),
        ).resolves.toHaveLength(0);
        await expect(
            repository.reivindicarLembrete(baseDraft.telefoneSessao, now),
        ).resolves.toBe(false);
        await expect(
            repository.reivindicarLembrete('5519888888888', now),
        ).resolves.toBe(false);
    });

    it('reseta claim ao substituir rascunho', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);
        await repository.reivindicarLembrete(
            baseDraft.telefoneSessao,
            new Date('2026-10-20T12:05:00-03:00'),
        );

        await repository.salvar({
            ...baseDraft,
            mensagemCriacaoId: 'message-2',
            criadoEm: new Date('2026-10-20T12:06:00-03:00'),
        });

        await expect(
            repository.obterValido(
                baseDraft.telefoneSessao,
                new Date('2026-10-20T12:07:00-03:00'),
            ),
        ).resolves.toMatchObject({
            mensagemCriacaoId: 'message-2',
            lembreteEnviadoEm: null,
            resumoEnviadoEm: null,
        });
    });

    it('não marca como enviado um rascunho substituto', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);
        await repository.salvar({
            ...baseDraft,
            mensagemCriacaoId: 'message-2',
        });

        await expect(
            repository.marcarResumoEnviado(
                baseDraft.telefoneSessao,
                'message-1',
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.toBe(false);
        await expect(
            repository.obterValido(
                baseDraft.telefoneSessao,
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.toMatchObject({
            mensagemCriacaoId: 'message-2',
            resumoEnviadoEm: null,
        });
    });

    it('lista e apaga apenas rascunhos expirados', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        const now = new Date('2026-10-20T12:10:00-03:00');
        await repository.salvar({
            ...baseDraft,
            expiraEm: new Date(now.getTime() - 1),
        });

        await expect(repository.listarExpirados(now)).resolves.toHaveLength(1);
        await expect(
            repository.apagarExpirado(baseDraft.telefoneSessao, now),
        ).resolves.toBe(true);
        await expect(repository.listarExpirados(now)).resolves.toHaveLength(0);
    });

    it('obterValido lê sem consumir e ignora expirado', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);

        await expect(
            repository.obterValido(
                baseDraft.telefoneSessao,
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.toMatchObject({ mensagemCriacaoId: 'message-1' });
        await expect(
            repository.obterValido(
                baseDraft.telefoneSessao,
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.not.toBeNull();
        await expect(
            repository.obterValido(
                baseDraft.telefoneSessao,
                new Date('2026-10-20T12:10:00-03:00'),
            ),
        ).resolves.toBeNull();
        await expect(
            repository.consumir(
                baseDraft.telefoneSessao,
                'message-2',
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.not.toBeNull();
    });

    it('não restaura rascunho antigo sobre rascunho novo', async () => {
        const repository = new InMemoryPendingAgendamentoRepository();
        await repository.salvar(baseDraft);
        const antigo = await repository.consumir(
            baseDraft.telefoneSessao,
            'message-2',
            new Date('2026-10-20T12:05:00-03:00'),
        );
        await repository.salvar({
            ...baseDraft,
            nomeCliente: 'Novo cliente',
            mensagemCriacaoId: 'message-3',
        });

        await expect(repository.restaurarSeAusente(antigo!)).resolves.toBe(
            false,
        );
        await expect(
            repository.consumir(
                baseDraft.telefoneSessao,
                'message-4',
                new Date('2026-10-20T12:05:00-03:00'),
            ),
        ).resolves.toMatchObject({ nomeCliente: 'Novo cliente' });
    });
});

describe('PrismaPendingAgendamentoRepository', () => {
    it('zera timestamps de envio ao criar ou substituir rascunho', async () => {
        const upsert = vi.fn().mockImplementation(({ create }) => ({
            ...create,
            criadoEm: create.criadoEm ?? new Date(),
        }));
        const prisma = {
            rascunhoAgendamento: { upsert },
        } as unknown as PrismaClient;
        const repository = new PrismaPendingAgendamentoRepository(prisma);

        await repository.salvar({
            ...baseDraft,
            lembreteEnviadoEm: new Date('2026-10-20T12:05:00-03:00'),
            resumoEnviadoEm: new Date('2026-10-20T12:05:00-03:00'),
        });

        const input = upsert.mock.calls[0][0];
        expect(input.create.lembreteEnviadoEm).toBeNull();
        expect(input.update.lembreteEnviadoEm).toBeNull();
        expect(input.create.resumoEnviadoEm).toBeNull();
        expect(input.update.resumoEnviadoEm).toBeNull();
    });

    it('filtra elegibilidade e claim por margem de expiração e início futuro', async () => {
        const findMany = vi.fn().mockResolvedValue([]);
        const updateMany = vi.fn().mockResolvedValue({ count: 0 });
        const prisma = {
            rascunhoAgendamento: { findMany, updateMany },
        } as unknown as PrismaClient;
        const repository = new PrismaPendingAgendamentoRepository(prisma);
        const now = new Date('2026-10-20T12:10:00.000Z');
        const margem = new Date(now.getTime() + 3 * 60_000);

        await repository.listarElegiveisParaLembrete(now, now);
        await repository.reivindicarLembrete(baseDraft.telefoneSessao, now);

        expect(findMany.mock.calls[0][0].where).toMatchObject({
            expiraEm: { gte: margem },
            dataHoraInicio: { gt: now },
        });
        expect(updateMany.mock.calls[0][0].where).toMatchObject({
            expiraEm: { gte: margem },
            dataHoraInicio: { gt: now },
        });
    });
});
