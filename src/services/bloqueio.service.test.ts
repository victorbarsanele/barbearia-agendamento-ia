import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/agendamento.repository', () => ({
    buscarConflito: vi.fn(),
}));

vi.mock('../repositories/bloqueio.repository', () => ({
    criar: vi.fn(),
}));

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as bloqueioService from './bloqueio.service';

describe('bloqueio.service.criar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue(null);
    });

    it('rejeita bloqueio que colide com agendamento existente', async () => {
        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue({
            id: 'agendamento-1',
        } as never);

        await expect(
            bloqueioService.criar({
                dataHoraInicio: '2026-07-22T10:00:00-03:00',
                dataHoraFim: '2026-07-22T11:00:00-03:00',
                motivo: 'Consulta médica',
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message:
                'Não é possível criar bloqueio: já existe agendamento não cancelado nesse intervalo.',
        });

        expect(bloqueioRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita bloqueio em domingo', async () => {
        await expect(
            bloqueioService.criar({
                dataHoraInicio: '2026-08-23T10:00:00-03:00',
                dataHoraFim: '2026-08-23T11:00:00-03:00',
                motivo: 'Domingo',
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            message:
                'Bloqueio deve estar dentro do horário de funcionamento (segunda a sábado, das 9h às 19h).',
        });

        expect(bloqueioRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita bloqueio fora do horário de funcionamento', async () => {
        await expect(
            bloqueioService.criar({
                dataHoraInicio: '2026-08-24T20:00:00-03:00',
                dataHoraFim: '2026-08-24T21:00:00-03:00',
                motivo: 'Fora do expediente',
            }),
        ).rejects.toMatchObject({
            statusCode: 422,
            message:
                'Bloqueio deve estar dentro do horário de funcionamento (segunda a sábado, das 9h às 19h).',
        });

        expect(bloqueioRepository.criar).not.toHaveBeenCalled();
    });

    it('cria bloqueio dentro do horário de funcionamento', async () => {
        vi.mocked(bloqueioRepository.criar).mockResolvedValue({
            id: 'bloqueio-1',
            dataHoraInicio: new Date('2026-08-24T10:00:00-03:00'),
            dataHoraFim: new Date('2026-08-24T11:00:00-03:00'),
            motivo: 'Compromisso',
            createdAt: new Date('2026-08-20T00:00:00Z'),
        });

        await expect(
            bloqueioService.criar({
                dataHoraInicio: '2026-08-24T10:00:00-03:00',
                dataHoraFim: '2026-08-24T11:00:00-03:00',
                motivo: 'Compromisso',
            }),
        ).resolves.toMatchObject({ id: 'bloqueio-1' });

        expect(bloqueioRepository.criar).toHaveBeenCalledTimes(1);
    });
});
