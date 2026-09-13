import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as clienteRepository from '../repositories/cliente.repository';
import * as clienteService from './cliente.service';

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: vi.fn(),
    buscarPorId: vi.fn(),
    criar: vi.fn(),
    atualizar: vi.fn(),
    listarTodos: vi.fn(),
    listarPaginado: vi.fn(),
    contar: vi.fn(),
    excluirPorId: vi.fn(),
}));

const clienteExistente = {
    id: 'cliente-1',
    nome: 'Maria',
    telefone: '5519974191311',
};

describe('cliente.service telefones', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('salva telefone sem 55 já normalizado', async () => {
        vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(null);
        vi.mocked(clienteRepository.criar).mockResolvedValue(
            clienteExistente as never,
        );

        await clienteService.criar({
            nome: 'Maria',
            telefone: '(19) 97419-1311',
        });

        expect(clienteRepository.buscarPorTelefone).toHaveBeenCalledWith(
            '5519974191311',
        );
        expect(clienteRepository.criar).toHaveBeenCalledWith({
            nome: 'Maria',
            telefone: '5519974191311',
        });
    });

    it('bloqueia duplicidade usando formatos com e sem 55', async () => {
        vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(
            clienteExistente as never,
        );

        await expect(
            clienteService.criar({
                nome: 'Maria 2',
                telefone: '19974191311',
            }),
        ).rejects.toMatchObject({
            message: 'Telefone já cadastrado.',
            statusCode: 409,
        });

        expect(clienteRepository.criar).not.toHaveBeenCalled();
        expect(clienteRepository.buscarPorTelefone).toHaveBeenCalledWith(
            '5519974191311',
        );
    });

    it('normaliza telefone antes de comparar e persistir na edição', async () => {
        vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(
            clienteExistente as never,
        );
        vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(null);
        vi.mocked(clienteRepository.atualizar).mockResolvedValue(
            clienteExistente as never,
        );

        await clienteService.atualizar('cliente-1', {
            nome: 'Maria Atualizada',
            telefone: '19974191311',
        });

        expect(clienteRepository.buscarPorTelefone).toHaveBeenCalledWith(
            '5519974191311',
        );
        expect(clienteRepository.atualizar).toHaveBeenCalledWith('cliente-1', {
            nome: 'Maria Atualizada',
            telefone: '5519974191311',
        });
    });
});
