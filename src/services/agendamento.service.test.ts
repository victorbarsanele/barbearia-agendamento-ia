import { StatusAgendamento } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/agendamento.repository', () => ({
    criar: vi.fn(),
    listarTodos: vi.fn(),
    buscarPorId: vi.fn(),
    buscarConflito: vi.fn(),
    atualizar: vi.fn(),
    cancelar: vi.fn(),
    contarAtivosPorClienteId: vi.fn(),
    contarAtivosPorServicoId: vi.fn(),
    excluirCanceladosPorClienteId: vi.fn(),
    excluirCanceladosPorServicoId: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('../repositories/servico.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('./gemini.service', () => ({
    sendWhatsAppText: vi.fn(),
    addToHistory: vi.fn(),
}));

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import * as geminiService from './gemini.service';
import * as agendamentoService from './agendamento.service';

const clienteBase = {
    id: 'cliente-1',
    nome: 'João Silva',
    telefone: '11999999999',
    createdAt: new Date('2026-07-20T00:00:00Z'),
};

const servicoBase = {
    id: 'servico-1',
    nome: 'Corte masculino',
    duracaoMinutos: 30,
    preco: null,
};

const agendamentoAtual = {
    id: 'agendamento-1',
    clienteId: clienteBase.id,
    servicoId: servicoBase.id,
    dataHoraInicio: new Date('2026-07-20T09:00:00-03:00'),
    dataHoraFim: new Date('2026-07-20T09:30:00-03:00'),
    status: StatusAgendamento.AGENDADO,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    updatedAt: new Date('2026-07-20T00:00:00Z'),
    cliente: clienteBase,
    servico: servicoBase,
};

function mockarDependenciasPadrao() {
    vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(clienteBase);
    vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(servicoBase);
    vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue(null);
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'));
    vi.clearAllMocks();
    mockarDependenciasPadrao();
});

describe('agendamento.service.criar', () => {
    it('rejeita agendamento com conflito de horário no mesmo barbeiro', async () => {
        vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue({
            ...agendamentoAtual,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Já existe um agendamento nesse horário.',
            statusCode: 409,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('aceita agendamento em horário livre sem conflito', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T10:30:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledWith({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: new Date('2026-07-20T13:00:00Z'),
            dataHoraFim: new Date('2026-07-20T13:30:00Z'),
            status: StatusAgendamento.AGENDADO,
        });
        expect(resultado).toMatchObject({
            status: StatusAgendamento.AGENDADO,
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
        });
    });

    it('rejeita agendamento antes das 9h', async () => {
        vi.setSystemTime(new Date('2026-07-20T10:00:00Z'));

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T08:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento deve estar dentro do horário de funcionamento: segunda a sábado, das 9h às 19h (horário de Brasília).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento depois das 19h', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 30,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T18:45:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento deve estar dentro do horário de funcionamento: segunda a sábado, das 9h às 19h (horário de Brasília).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento em domingo', async () => {
        vi.setSystemTime(new Date('2026-07-18T12:00:00Z'));

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-19T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Barbearia funciona de segunda a sábado, das 9h às 19h (horário de Brasília).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento com antecedência menor que o mínimo permitido', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T09:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento deve ser feito com no mínimo 1 hora de antecedência.',
            statusCode: 422,
        });
    });

    it('aceita agendamento com antecedência exatamente no limite mínimo', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T10:30:00-03:00'),
            status: StatusAgendamento.AGENDADO,
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('rejeita agendamento que começa exatamente às 11:30', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento que começa às 11:00 com duração de 60 minutos', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });
    });

    it('rejeita agendamento que começa às 11:45', async () => {
        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:45:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });
    });

    it('aceita agendamento que termina exatamente às 11:30', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('aceita agendamento que começa exatamente às 12:00', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T12:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T12:30:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T12:00:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });

    it('aceita agendamento normal fora da janela de almoço', async () => {
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T12:30:00-03:00'),
            dataHoraFim: new Date('2026-07-20T13:00:00-03:00'),
        });

        const resultado = await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T12:30:00-03:00',
        });

        expect(resultado.status).toBe(StatusAgendamento.AGENDADO);
        expect(agendamentoRepository.criar).toHaveBeenCalledTimes(1);
    });
});

describe('agendamento.service.cancelar', () => {
    it('altera status para CANCELADO sem deletar registro', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        const resultado = await agendamentoService.cancelar('agendamento-1');

        expect(agendamentoRepository.cancelar).toHaveBeenCalledWith(
            'agendamento-1',
        );
        expect(resultado.status).toBe(StatusAgendamento.CANCELADO);
        expect(resultado.id).toBe('agendamento-1');
    });
});

describe('agendamento.service.atualizar', () => {
    it('chama notificação quando reagendamento muda horário', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
            cliente: clienteBase,
            servico: servicoBase,
        });

        const resultado = await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
        });

        expect(agendamentoRepository.atualizar).toHaveBeenCalledWith(
            'agendamento-1',
            expect.objectContaining({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
                dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
                status: StatusAgendamento.AGENDADO,
            }),
        );
        expect(geminiService.sendWhatsAppText).toHaveBeenCalledTimes(1);
        expect(geminiService.sendWhatsAppText).toHaveBeenCalledWith(
            clienteBase.telefone,
            expect.stringContaining(
                'Seu agendamento foi remarcado pelo barbeiro.',
            ),
        );
        expect(resultado.dataHoraInicio).toEqual(
            new Date('2026-07-20T11:00:00-03:00'),
        );
    });

    it('rejeita reagendamento que sobrepõe horário de almoço', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue({
            ...servicoBase,
            duracaoMinutos: 60,
        });

        await expect(
            agendamentoService.atualizar('agendamento-1', {
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T11:00:00-03:00',
                status: StatusAgendamento.AGENDADO,
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Agendamento não pode ocorrer no horário de almoço (11h30 às 12h00).',
            statusCode: 422,
        });

        expect(agendamentoRepository.atualizar).not.toHaveBeenCalled();
    });
});
