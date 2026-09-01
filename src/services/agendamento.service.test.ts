import { StatusAgendamento } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/agendamento.repository', () => ({
    criar: vi.fn(),
    listarTodos: vi.fn(),
    buscarPorId: vi.fn(),
    buscarConflito: vi.fn(),
    atualizar: vi.fn(),
    cancelar: vi.fn(),
    concluirComPacote: vi.fn(),
    contarAtivosPorClienteId: vi.fn(),
    contarAtivosPorServicoId: vi.fn(),
    excluirCanceladosPorClienteId: vi.fn(),
    excluirCanceladosPorServicoId: vi.fn(),
}));

vi.mock('../repositories/bloqueio.repository', () => ({
    buscarConflito: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('../repositories/servico.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('../repositories/pacoteCliente.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('./gemini.service', () => ({
    sendWhatsAppText: vi.fn(),
    addToHistory: vi.fn(),
}));

import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as bloqueioRepository from '../repositories/bloqueio.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import * as pacoteClienteRepository from '../repositories/pacoteCliente.repository';
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
    pacoteClienteId: null,
    dataHoraInicio: new Date('2026-07-20T09:00:00-03:00'),
    dataHoraFim: new Date('2026-07-20T09:30:00-03:00'),
    status: StatusAgendamento.AGENDADO,
    concluido: false,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    updatedAt: new Date('2026-07-20T00:00:00Z'),
    cliente: clienteBase,
    servico: servicoBase,
};

function mockarDependenciasPadrao() {
    vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(clienteBase);
    vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(servicoBase);
    vi.mocked(agendamentoRepository.buscarConflito).mockResolvedValue(null);
    vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue(null);
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
            pacoteClienteId: null,
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

    it('rejeita criação quando horário colide com bloqueio', async () => {
        vi.mocked(bloqueioRepository.buscarConflito).mockResolvedValue({
            id: 'bloqueio-1',
            dataHoraInicio: new Date('2026-07-20T10:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:00:00-03:00'),
            motivo: 'Consulta médica',
            createdAt: new Date('2026-07-19T00:00:00Z'),
        });

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                dataHoraInicio: '2026-07-20T10:30:00-03:00',
            }),
        ).rejects.toMatchObject({
            statusCode: 409,
            message: 'Horário bloqueado pelo barbeiro: Consulta médica.',
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
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
            notificarCliente: true,
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

    it('não chama notificação quando reagendamento não está marcado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });

        await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: false,
        });

        expect(geminiService.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it('não chama notificação quando reagendamento não muda horário nem serviço', async () => {
        vi.setSystemTime(new Date('2026-07-20T11:00:00Z'));
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
        });

        await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T09:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: true,
        });

        expect(geminiService.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it('mantém atualização quando envio de reagendamento falha', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.atualizar).mockResolvedValue({
            ...agendamentoAtual,
            dataHoraInicio: new Date('2026-07-20T11:00:00-03:00'),
            dataHoraFim: new Date('2026-07-20T11:30:00-03:00'),
        });
        vi.mocked(geminiService.sendWhatsAppText).mockRejectedValueOnce(
            new Error('Evolution indisponível'),
        );

        const resultado = await agendamentoService.atualizar('agendamento-1', {
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            dataHoraInicio: '2026-07-20T11:00:00-03:00',
            status: StatusAgendamento.AGENDADO,
            notificarCliente: true,
        });

        expect(agendamentoRepository.atualizar).toHaveBeenCalledTimes(1);
        expect(resultado.id).toBe('agendamento-1');
    });

    it('notifica cancelamento quando marcado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        await agendamentoService.cancelar('agendamento-1', true);

        expect(geminiService.sendWhatsAppText).toHaveBeenCalledWith(
            clienteBase.telefone,
            expect.stringContaining(
                'Seu agendamento foi cancelado pelo barbeiro.',
            ),
        );
        expect(geminiService.sendWhatsAppText).toHaveBeenCalledWith(
            clienteBase.telefone,
            expect.stringContaining('Serviço: Corte masculino'),
        );
        expect(geminiService.addToHistory).toHaveBeenCalledWith(
            clienteBase.telefone,
            'model',
            expect.stringContaining(
                'Seu agendamento foi cancelado pelo barbeiro.',
            ),
        );
    });

    it('não notifica cancelamento quando não marcado', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });

        await agendamentoService.cancelar('agendamento-1', false);

        expect(geminiService.sendWhatsAppText).not.toHaveBeenCalled();
    });

    it('mantém cancelamento quando envio de cancelamento falha', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
        });
        vi.mocked(agendamentoRepository.cancelar).mockResolvedValue({
            ...agendamentoAtual,
            status: StatusAgendamento.CANCELADO,
        });
        vi.mocked(geminiService.sendWhatsAppText).mockRejectedValueOnce(
            new Error('Evolution indisponível'),
        );

        const resultado = await agendamentoService.cancelar(
            'agendamento-1',
            true,
        );

        expect(agendamentoRepository.cancelar).toHaveBeenCalledWith(
            'agendamento-1',
        );
        expect(resultado.status).toBe(StatusAgendamento.CANCELADO);
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

describe('agendamento.service.criar com pacoteClienteId', () => {
    it('rejeita quando pacoteCliente informado não existe', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não encontrado.',
            statusCode: 404,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita quando pacoteCliente não está ativo', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'FINALIZADO',
            quantidadeRestante: 3,
        } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não está ativo.',
            statusCode: 400,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('rejeita quando pacoteCliente está esgotado', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            quantidadeRestante: 0,
        } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente está esgotado.',
            statusCode: 400,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });

    it('aceita quando pacoteCliente está ativo e com saldo', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            quantidadeRestante: 2,
            pacote: {
                servicos: [{ servicoId: servicoBase.id }],
            },
        } as never);
        vi.mocked(agendamentoRepository.criar).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
        });

        await agendamentoService.criar({
            clienteId: clienteBase.id,
            servicoId: servicoBase.id,
            pacoteClienteId: 'pacote-cliente-1',
            dataHoraInicio: '2026-07-20T10:00:00-03:00',
        });

        expect(agendamentoRepository.criar).toHaveBeenCalledWith(
            expect.objectContaining({ pacoteClienteId: 'pacote-cliente-1' }),
        );
    });

    it('rejeita quando serviço não está incluso no pacote selecionado', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            quantidadeRestante: 2,
            pacote: {
                servicos: [{ servicoId: 'outro-servico' }],
            },
        } as never);

        await expect(
            agendamentoService.criar({
                clienteId: clienteBase.id,
                servicoId: servicoBase.id,
                pacoteClienteId: 'pacote-cliente-1',
                dataHoraInicio: '2026-07-20T10:00:00-03:00',
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Este serviço não está incluso no pacote selecionado.',
            statusCode: 400,
        });

        expect(agendamentoRepository.criar).not.toHaveBeenCalled();
    });
});

describe('agendamento.service.concluir', () => {
    it('rejeita quando agendamento não existe', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            agendamentoService.concluir('agendamento-inexistente'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não encontrado.',
            statusCode: 404,
        });
    });

    it('rejeita quando agendamento não está vinculado a pacote', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: null,
        });

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento não vinculado a pacote.',
            statusCode: 400,
        });

        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });

    it('rejeita idempotentemente quando agendamento já está concluído (não decrementa de novo)', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: true,
        });

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Agendamento já está concluído.',
            statusCode: 409,
        });

        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });

    it('conclui agendamento vinculado a pacote e decrementa quantidadeRestante', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: false,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(agendamentoRepository.concluirComPacote).mockResolvedValue({
            agendamento: {
                ...agendamentoAtual,
                pacoteClienteId: 'pacote-cliente-1',
                concluido: true,
            },
            pacoteCliente: {
                id: 'pacote-cliente-1',
                quantidadeRestante: 1,
                status: 'ATIVO',
            } as never,
        });

        const resultado = await agendamentoService.concluir('agendamento-1');

        expect(agendamentoRepository.concluirComPacote).toHaveBeenCalledWith(
            'agendamento-1',
            'pacote-cliente-1',
        );
        expect(resultado).toMatchObject({ concluido: true });
    });

    it('rejeita conclusão quando o pacote do cliente não está ativo (ex: cancelado)', async () => {
        vi.mocked(agendamentoRepository.buscarPorId).mockResolvedValue({
            ...agendamentoAtual,
            pacoteClienteId: 'pacote-cliente-1',
            concluido: false,
        });
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'CANCELADO',
        } as never);

        await expect(
            agendamentoService.concluir('agendamento-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Não é possível concluir: pacote do cliente não está ativo.',
            statusCode: 409,
        });

        expect(agendamentoRepository.concluirComPacote).not.toHaveBeenCalled();
    });
});
