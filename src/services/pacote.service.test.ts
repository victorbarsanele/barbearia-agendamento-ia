import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/pacote.repository', () => ({
    criar: vi.fn(),
    listarTodos: vi.fn(),
    buscarPorId: vi.fn(),
    atualizar: vi.fn(),
    excluirPorId: vi.fn(),
    contarClientesVinculados: vi.fn(),
}));

vi.mock('../repositories/pacoteCliente.repository', () => ({
    criar: vi.fn(),
    buscarAtivoPorClienteId: vi.fn(),
    buscarPorId: vi.fn(),
    atualizarStatus: vi.fn(),
}));

vi.mock('../repositories/agendamento.repository', () => ({
    contarPendentesPorPacoteClienteId: vi.fn(),
}));

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorId: vi.fn(),
}));

vi.mock('../repositories/servico.repository', () => ({
    buscarPorId: vi.fn(),
}));

import * as clienteRepository from '../repositories/cliente.repository';
import * as agendamentoRepository from '../repositories/agendamento.repository';
import * as pacoteRepository from '../repositories/pacote.repository';
import * as pacoteClienteRepository from '../repositories/pacoteCliente.repository';
import * as servicoRepository from '../repositories/servico.repository';
import * as pacoteService from './pacote.service';

const clienteBase = {
    id: 'cliente-1',
    nome: 'João Silva',
    telefone: '11999999999',
    createdAt: new Date('2026-07-20T00:00:00Z'),
};

const pacoteBase = {
    id: 'pacote-1',
    nome: 'Pacote 5 cortes',
    duracaoDias: 60,
    quantidade: 5,
    createdAt: new Date('2026-07-20T00:00:00Z'),
    servicos: [],
};

const servicoBase = {
    id: 'servico-1',
    nome: 'Corte masculino',
    duracaoMinutos: 30,
    preco: null,
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('pacote.service.vincularCliente', () => {
    it('rejeita quando cliente já possui um pacote ativo', async () => {
        vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(clienteBase);
        vi.mocked(pacoteRepository.buscarPorId).mockResolvedValue(
            pacoteBase as never,
        );
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue({ id: 'pacote-cliente-existente' } as never);

        await expect(
            pacoteService.vincularCliente({
                clienteId: clienteBase.id,
                pacoteId: pacoteBase.id,
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Cliente já possui um pacote ativo.',
            statusCode: 409,
        });

        expect(pacoteClienteRepository.criar).not.toHaveBeenCalled();
    });

    it('cria PacoteCliente com quantidadeTotal e quantidadeRestante copiados do pacote', async () => {
        vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(clienteBase);
        vi.mocked(pacoteRepository.buscarPorId).mockResolvedValue(
            pacoteBase as never,
        );
        vi.mocked(
            pacoteClienteRepository.buscarAtivoPorClienteId,
        ).mockResolvedValue(null);
        vi.mocked(pacoteClienteRepository.criar).mockResolvedValue({
            id: 'pacote-cliente-1',
        } as never);

        await pacoteService.vincularCliente({
            clienteId: clienteBase.id,
            pacoteId: pacoteBase.id,
        });

        expect(pacoteClienteRepository.criar).toHaveBeenCalledWith(
            expect.objectContaining({
                clienteId: clienteBase.id,
                pacoteId: pacoteBase.id,
                quantidadeTotal: pacoteBase.quantidade,
                quantidadeRestante: pacoteBase.quantidade,
            }),
        );
    });

    it('rejeita quando cliente não existe', async () => {
        vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            pacoteService.vincularCliente({
                clienteId: 'cliente-inexistente',
                pacoteId: pacoteBase.id,
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Cliente não encontrado.',
            statusCode: 404,
        });
    });
});

describe('pacote.service.excluirPorId', () => {
    it('rejeita exclusão de pacote com clientes vinculados', async () => {
        vi.mocked(pacoteRepository.buscarPorId).mockResolvedValue(
            pacoteBase as never,
        );
        vi.mocked(pacoteRepository.contarClientesVinculados).mockResolvedValue(
            2,
        );

        await expect(
            pacoteService.excluirPorId(pacoteBase.id),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Não é possível excluir pacote com clientes vinculados.',
            statusCode: 409,
        });

        expect(pacoteRepository.excluirPorId).not.toHaveBeenCalled();
    });

    it('exclui pacote sem clientes vinculados', async () => {
        vi.mocked(pacoteRepository.buscarPorId).mockResolvedValue(
            pacoteBase as never,
        );
        vi.mocked(pacoteRepository.contarClientesVinculados).mockResolvedValue(
            0,
        );

        await pacoteService.excluirPorId(pacoteBase.id);

        expect(pacoteRepository.excluirPorId).toHaveBeenCalledWith(
            pacoteBase.id,
        );
    });
});

describe('pacote.service.criar', () => {
    it('rejeita quando algum serviço informado não existe', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            pacoteService.criar({
                nome: 'Pacote inválido',
                duracaoDias: 30,
                quantidade: 3,
                servicoIds: ['servico-inexistente'],
            }),
        ).rejects.toMatchObject({
            name: 'AppError',
            statusCode: 404,
        });

        expect(pacoteRepository.criar).not.toHaveBeenCalled();
    });

    it('cria pacote quando todos os serviços existem', async () => {
        vi.mocked(servicoRepository.buscarPorId).mockResolvedValue(
            servicoBase as never,
        );
        vi.mocked(pacoteRepository.criar).mockResolvedValue(
            pacoteBase as never,
        );

        await pacoteService.criar({
            nome: pacoteBase.nome,
            duracaoDias: pacoteBase.duracaoDias,
            quantidade: pacoteBase.quantidade,
            servicoIds: [servicoBase.id],
        });

        expect(pacoteRepository.criar).toHaveBeenCalled();
    });
});

describe('pacote.service.desvincularCliente', () => {
    it('rejeita quando pacoteCliente não existe', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue(null);

        await expect(
            pacoteService.desvincularCliente('pacote-cliente-inexistente'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote do cliente não encontrado.',
            statusCode: 404,
        });

        expect(pacoteClienteRepository.atualizarStatus).not.toHaveBeenCalled();
    });

    it('rejeita quando pacoteCliente já está cancelado', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'CANCELADO',
        } as never);

        await expect(
            pacoteService.desvincularCliente('pacote-cliente-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote já não está ativo.',
            statusCode: 409,
        });

        expect(pacoteClienteRepository.atualizarStatus).not.toHaveBeenCalled();
    });

    it('rejeita quando pacoteCliente já está finalizado', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'FINALIZADO',
        } as never);

        await expect(
            pacoteService.desvincularCliente('pacote-cliente-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message: 'Pacote já não está ativo.',
            statusCode: 409,
        });

        expect(pacoteClienteRepository.atualizarStatus).not.toHaveBeenCalled();
    });

    it('bloqueia quando há agendamento pendente/futuro vinculado ao pacote', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
        } as never);
        vi.mocked(
            agendamentoRepository.contarPendentesPorPacoteClienteId,
        ).mockResolvedValue(1);

        await expect(
            pacoteService.desvincularCliente('pacote-cliente-1'),
        ).rejects.toMatchObject({
            name: 'AppError',
            message:
                'Não é possível desvincular: há agendamento(s) pendente(s) vinculado(s) a este pacote. Cancele ou reagende antes de desvincular.',
            statusCode: 409,
        });

        expect(pacoteClienteRepository.atualizarStatus).not.toHaveBeenCalled();
    });

    it('desvincula com sucesso quando não há agendamento pendente', async () => {
        vi.mocked(pacoteClienteRepository.buscarPorId).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'ATIVO',
            quantidadeRestante: 3,
        } as never);
        vi.mocked(
            agendamentoRepository.contarPendentesPorPacoteClienteId,
        ).mockResolvedValue(0);
        vi.mocked(pacoteClienteRepository.atualizarStatus).mockResolvedValue({
            id: 'pacote-cliente-1',
            status: 'CANCELADO',
            quantidadeRestante: 3,
        } as never);

        const resultado =
            await pacoteService.desvincularCliente('pacote-cliente-1');

        expect(pacoteClienteRepository.atualizarStatus).toHaveBeenCalledWith(
            'pacote-cliente-1',
            'CANCELADO',
        );
        expect(resultado).toMatchObject({ status: 'CANCELADO' });
    });
});
