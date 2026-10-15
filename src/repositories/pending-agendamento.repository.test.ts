import { describe, expect, it } from 'vitest';
import { InMemoryPendingAgendamentoRepository } from './pending-agendamento.repository';

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
