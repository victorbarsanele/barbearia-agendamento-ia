import { afterEach, describe, expect, it } from 'vitest';
import prisma from '../lib/prisma';
import { PrismaPendingAgendamentoRepository } from './pending-agendamento.repository';

const telefoneSessao = `5519${Date.now().toString().slice(-9)}`;

describe('PrismaPendingAgendamentoRepository', () => {
    const repository = new PrismaPendingAgendamentoRepository(prisma);
    const servicoId = 'integration-pending-service';

    afterEach(async () => {
        await prisma.rascunhoAgendamento.deleteMany({
            where: { telefoneSessao },
        });
    });

    it('consome atômico, expira e sobrescreve por telefone', async () => {
        await prisma.servico.upsert({
            where: { id: servicoId },
            create: {
                id: servicoId,
                nome: 'Serviço de integração',
                duracaoMinutos: 30,
            },
            update: {},
        });

        await repository.salvar({
            telefoneSessao,
            nomeCliente: 'João',
            telefoneCliente: telefoneSessao,
            servicoId,
            dataHoraInicio: new Date('2026-10-20T13:00:00-03:00'),
            mensagemCriacaoId: 'integration-message-1',
            expiraEm: new Date('2026-10-20T13:10:00-03:00'),
        });

        const results = await Promise.all([
            repository.consumir(
                telefoneSessao,
                'integration-message-2',
                new Date('2026-10-20T13:05:00-03:00'),
            ),
            repository.consumir(
                telefoneSessao,
                'integration-message-3',
                new Date('2026-10-20T13:05:00-03:00'),
            ),
        ]);

        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('não restaura rascunho antigo quando outro já ocupa telefone', async () => {
        await prisma.servico.upsert({
            where: { id: servicoId },
            create: {
                id: servicoId,
                nome: 'Serviço de integração',
                duracaoMinutos: 30,
            },
            update: {},
        });
        const antigo = {
            telefoneSessao,
            nomeCliente: 'Antigo',
            telefoneCliente: telefoneSessao,
            servicoId,
            dataHoraInicio: new Date('2026-10-20T13:00:00-03:00'),
            mensagemCriacaoId: 'integration-message-old',
            expiraEm: new Date('2026-10-20T13:10:00-03:00'),
        };
        await repository.salvar(antigo);
        const consumido = await repository.consumir(
            telefoneSessao,
            'integration-message-confirm',
            new Date('2026-10-20T13:05:00-03:00'),
        );
        await repository.salvar({
            ...antigo,
            nomeCliente: 'Novo',
            mensagemCriacaoId: 'integration-message-new',
        });

        await expect(
            repository.restaurarSeAusente(consumido!),
        ).resolves.toBe(false);
        await expect(
            repository.consumir(
                telefoneSessao,
                'integration-message-next',
                new Date('2026-10-20T13:05:00-03:00'),
            ),
        ).resolves.toMatchObject({ nomeCliente: 'Novo' });
    });
});
