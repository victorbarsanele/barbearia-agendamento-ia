import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/horarioFuncionamento.repository', () => ({
    listarTodos: vi.fn(),
    atualizarTodos: vi.fn(),
}));

import * as horarioFuncionamentoRepository from '../repositories/horarioFuncionamento.repository';
import * as horarioFuncionamentoService from './horario-funcionamento.service';

const configuracao = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaAberturaMinutos: diaSemana === 6 ? 480 : 540,
    horaFechamentoMinutos: diaSemana === 6 ? 1020 : 1200,
    limiteExtensaoMinutos: [4, 5].includes(diaSemana) ? 1230 : null,
    ultimoInicioExtensaoMinutos: [4, 5].includes(diaSemana) ? 1170 : null,
}));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(horarioFuncionamentoRepository.listarTodos).mockResolvedValue(
        configuracao.map((item) => ({
            ...item,
            id: `horario-${item.diaSemana}`,
            updatedAt: new Date('2026-09-16T00:00:00Z'),
        })),
    );
    vi.mocked(horarioFuncionamentoRepository.atualizarTodos).mockResolvedValue(
        configuracao.map((item) => ({
            ...item,
            id: `horario-${item.diaSemana}`,
            updatedAt: new Date('2026-09-16T00:00:00Z'),
        })),
    );
});

describe('horario-funcionamento.service.atualizarConfiguracao', () => {
    it('aceita último início da extensão antes do fechamento normal', async () => {
        const resultado =
            await horarioFuncionamentoService.atualizarConfiguracao([
                null,
                ...configuracao,
            ]);

        expect(resultado[4]).toMatchObject({
            horaFechamentoMinutos: 1200,
            limiteExtensaoMinutos: 1230,
            ultimoInicioExtensaoMinutos: 1170,
        });
        expect(
            horarioFuncionamentoRepository.atualizarTodos,
        ).toHaveBeenCalledWith(configuracao);
    });
});
