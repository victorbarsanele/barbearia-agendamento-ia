import { StatusAgendamento } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarApiError } from './google-calendar.adapter';
import { processarItemSincronizacao } from './sync.worker';

const base = new Date('2026-10-26T12:00:00.000Z');
const item = { agendamentoId: 'agendamento-1', tentativas: 0, versao: 3 };
const agendamento = {
    id: item.agendamentoId,
    dataHoraInicio: new Date('2026-10-27T13:00:00.000Z'),
    dataHoraFim: new Date('2026-10-27T13:30:00.000Z'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    cliente: { nome: 'Maria', telefone: '5511999999999' },
    servico: { nome: 'Corte' },
};

function dependencies(
    current: typeof agendamento | null,
    syncFailure?: unknown,
) {
    const repository = {
        reivindicar: vi.fn(),
        buscarAgendamento: vi.fn().mockResolvedValue(current),
        finalizar: vi.fn().mockResolvedValue(true),
    };
    const adapter = {
        inserirOuReativar:
            syncFailure === undefined
                ? vi.fn().mockResolvedValue(undefined)
                : vi.fn().mockRejectedValue(syncFailure),
        excluir: vi.fn().mockResolvedValue(undefined),
    };
    return {
        repository,
        adapter,
        agora: () => base,
        logError: vi.fn(),
    };
}

describe('processarItemSincronizacao', () => {
    it.each([
        ['inexistente', null],
        ['cancelado', { ...agendamento, status: StatusAgendamento.CANCELADO }],
    ])('remove evento de agendamento %s', async (_label, current) => {
        const deps = dependencies(current as typeof agendamento | null);
        await processarItemSincronizacao(item, deps as never);

        expect(deps.adapter.excluir).toHaveBeenCalledOnce();
        expect(deps.adapter.inserirOuReativar).not.toHaveBeenCalled();
        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({ status: 'SINCRONIZADO', tentativas: 0 }),
        );
    });

    it('reagenda falha transitória com backoff exponencial', async () => {
        const deps = dependencies(
            agendamento,
            new GoogleCalendarApiError(503, true),
        );
        await processarItemSincronizacao(item, deps as never);

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({
                status: 'PENDENTE',
                tentativas: 1,
                proximaTentativaEm: new Date(base.getTime() + 30_000),
            }),
        );
        expect(deps.logError).not.toHaveBeenCalled();
    });

    it('marca falha permanente como ERRO sem logar dados pessoais', async () => {
        const deps = dependencies(
            agendamento,
            new GoogleCalendarApiError(400, false),
        );
        await processarItemSincronizacao(item, deps as never);

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({ status: 'ERRO', tentativas: 1 }),
        );
        expect(deps.logError).toHaveBeenCalledWith({
            agendamentoId: item.agendamentoId,
            erro: 'Google Calendar HTTP 400',
        });
        expect(JSON.stringify(deps.logError.mock.calls)).not.toContain(
            agendamento.cliente.telefone,
        );
    });

    it('marca ERRO ao atingir oito tentativas', async () => {
        const deps = dependencies(
            agendamento,
            new GoogleCalendarApiError(503, true),
        );
        await processarItemSincronizacao(
            { ...item, tentativas: 7 },
            deps as never,
        );

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            item.versao,
            expect.objectContaining({ status: 'ERRO', tentativas: 8 }),
        );
    });

    it('usa versão reivindicada no compare-and-set', async () => {
        const deps = dependencies(agendamento);
        deps.repository.finalizar.mockResolvedValue(false);
        await processarItemSincronizacao(item, deps as never);

        expect(deps.repository.finalizar).toHaveBeenCalledWith(
            item.agendamentoId,
            3,
            expect.objectContaining({ status: 'SINCRONIZADO' }),
        );
    });
});
