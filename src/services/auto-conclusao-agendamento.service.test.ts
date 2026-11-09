import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    listarParaConclusaoAutomatica: vi.fn(),
    concluirAutomaticamente: vi.fn(),
    enfileirarSincronizacao: vi.fn(),
}));

vi.mock('../repositories/agendamento.repository', () => ({
    listarParaConclusaoAutomatica: mocks.listarParaConclusaoAutomatica,
}));
vi.mock('./agendamento.service', () => ({
    concluirAutomaticamente: mocks.concluirAutomaticamente,
}));
vi.mock('../google-calendar/sync.service', () => ({
    enfileirarSincronizacao: mocks.enfileirarSincronizacao,
}));

import {
    iniciarJobAutoConclusao,
    processarCicloAutoConclusao,
} from './auto-conclusao-agendamento.service';

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'true');
    vi.stubEnv('AUTO_CONCLUSAO_A_PARTIR_DE', '2026-11-01');
    vi.stubEnv('AUTO_CONCLUSAO_HORA_LOCAL', '6');
    mocks.listarParaConclusaoAutomatica.mockResolvedValue([]);
    mocks.enfileirarSincronizacao.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

describe('processarCicloAutoConclusao', () => {
    it('não instala intervalo quando feature está desligada', () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');
        const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

        iniciarJobAutoConclusao();

        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('não consulta candidatos quando feature está desligada', async () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');

        await processarCicloAutoConclusao();

        expect(mocks.listarParaConclusaoAutomatica).not.toHaveBeenCalled();
    });

    it('pula saldo esgotado, conclui outros e isola falhas', async () => {
        const candidatos = [
            { id: 'feito', pacoteClienteId: 'pc-1', servicoId: 's-1' },
            { id: 'sem-saldo', pacoteClienteId: 'pc-2', servicoId: 's-2' },
            { id: 'ignorado', pacoteClienteId: 'pc-3', servicoId: 's-3' },
            { id: 'falha', pacoteClienteId: 'pc-4', servicoId: 's-4' },
        ];
        mocks.listarParaConclusaoAutomatica.mockResolvedValue(candidatos);
        mocks.concluirAutomaticamente
            .mockResolvedValueOnce({ estado: 'CONCLUIDO' })
            .mockResolvedValueOnce({ estado: 'SALDO_ESGOTADO' })
            .mockResolvedValueOnce({ estado: 'IGNORADO' })
            .mockRejectedValueOnce(new Error('falha de teste'));
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await processarCicloAutoConclusao(new Date('2026-11-08T12:00:00.000Z'));

        expect(mocks.enfileirarSincronizacao).toHaveBeenCalledOnce();
        expect(mocks.enfileirarSincronizacao).toHaveBeenCalledWith(['feito']);
        expect(info).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({
                concluidos: 1,
                ignorados: 1,
                falhas: 1,
                pendenciasSaldoEsgotado: 1,
            }),
        );
    });

    it('não derruba ciclo quando enqueue Google falha', async () => {
        mocks.listarParaConclusaoAutomatica.mockResolvedValue([
            { id: 'feito', pacoteClienteId: 'pc-1', servicoId: 's-1' },
        ]);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'CONCLUIDO',
        });
        mocks.enfileirarSincronizacao.mockRejectedValueOnce(
            new Error('Google indisponível'),
        );
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            processarCicloAutoConclusao(new Date('2026-11-08T12:00:00.000Z')),
        ).resolves.toBeUndefined();
        expect(info).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({ concluidos: 1, falhasSincronizacao: 1 }),
        );
    });

    it('avisa uma vez por agendamento e mantém pendência em cada ciclo', async () => {
        const candidato = {
            id: 'saldo-aviso-unico',
            pacoteClienteId: 'pc-1',
            servicoId: 's-1',
        };
        mocks.listarParaConclusaoAutomatica.mockResolvedValue([candidato]);
        mocks.concluirAutomaticamente.mockResolvedValue({
            estado: 'SALDO_ESGOTADO',
        });
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});

        await processarCicloAutoConclusao(new Date('2026-11-08T12:00:00.000Z'));
        await processarCicloAutoConclusao(new Date('2026-11-08T12:15:00.000Z'));

        expect(aviso).toHaveBeenCalledOnce();
        expect(aviso).toHaveBeenCalledWith(
            '[AUTO CONCLUSAO] Saldo esgotado.',
            expect.objectContaining({ agendamentoId: candidato.id }),
        );
        expect(info).toHaveBeenNthCalledWith(
            1,
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({ pendenciasSaldoEsgotado: 1 }),
        );
        expect(info).toHaveBeenNthCalledWith(
            2,
            '[AUTO CONCLUSAO] Ciclo finalizado.',
            expect.objectContaining({ pendenciasSaldoEsgotado: 1 }),
        );
    });
});
