import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const googleSyncMocks = vi.hoisted(() => ({
    listarIdsFuturosPorCliente: vi.fn(),
    listarIdsPorCliente: vi.fn(),
    enfileirarSincronizacao: vi.fn(),
}));

vi.mock('../google-calendar/sync.repository', () => ({
    listarIdsFuturosPorCliente: googleSyncMocks.listarIdsFuturosPorCliente,
    listarIdsPorCliente: googleSyncMocks.listarIdsPorCliente,
}));
vi.mock('../google-calendar/sync.service', () => ({
    enfileirarSincronizacao: googleSyncMocks.enfileirarSincronizacao,
}));

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
    obterResumoExclusao: vi.fn(),
    excluirComHistorico: vi.fn(),
}));

const clienteExistente = {
    id: 'cliente-1',
    nome: 'Maria',
    telefone: '5519974191311',
};

const resumoSemHistorico = {
    cliente: { id: 'cliente-1', nome: 'Maria' },
    agendamentos: {
        concluidos: 0,
        cancelados: 0,
        passados: 0,
        emAberto: 0,
    },
    pacotes: { ativos: 0, finalizados: 0, cancelados: 0 },
    lotes: 0,
    temHistorico: false,
    impedimentos: [],
};

function habilitarGoogleSync(): void {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'true');
    vi.stubEnv(
        'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64',
        Buffer.from(
            JSON.stringify({
                client_email: 'calendar@example.test',
                private_key: privateKey.export({
                    type: 'pkcs8',
                    format: 'pem',
                }),
            }),
        ).toString('base64'),
    );
    vi.stubEnv('GOOGLE_CALENDAR_ID', 'calendar-id');
}

describe('cliente.service telefones', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        googleSyncMocks.listarIdsFuturosPorCliente.mockResolvedValue([]);
        googleSyncMocks.listarIdsPorCliente.mockResolvedValue([]);
        googleSyncMocks.enfileirarSincronizacao.mockResolvedValue(undefined);
    });

    afterEach(() => vi.unstubAllEnvs());

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

    it('mantém atualização quando enfileiramento falha', async () => {
        habilitarGoogleSync();
        vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(
            clienteExistente as never,
        );
        vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(null);
        vi.mocked(clienteRepository.atualizar).mockResolvedValue(
            clienteExistente as never,
        );
        googleSyncMocks.enfileirarSincronizacao.mockRejectedValueOnce(
            new Error('outbox unavailable'),
        );

        await expect(
            clienteService.atualizar('cliente-1', {
                nome: 'Maria Nova',
                telefone: '19974191311',
            }),
        ).resolves.toEqual(clienteExistente);
    });

    it('retorna 404 ao buscar resumo de cliente inexistente', async () => {
        vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue(
            null,
        );

        await expect(
            clienteService.obterResumoExclusao('cliente-inexistente'),
        ).rejects.toMatchObject({
            message: 'Cliente não encontrado.',
            statusCode: 404,
        });
    });

    it('exclui sem confirmação quando não existe histórico', async () => {
        vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue(
            resumoSemHistorico,
        );

        await clienteService.excluirPorId('cliente-1');

        expect(clienteRepository.excluirComHistorico).toHaveBeenCalledWith(
            'cliente-1',
        );
    });

    it('exige confirmação quando cliente possui histórico', async () => {
        vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue({
            ...resumoSemHistorico,
            temHistorico: true,
        });

        await expect(
            clienteService.excluirPorId('cliente-1'),
        ).rejects.toMatchObject({
            message:
                'Este cliente possui histórico. Confirme a exclusão do histórico para continuar.',
            statusCode: 409,
        });
        expect(clienteRepository.excluirComHistorico).not.toHaveBeenCalled();
    });

    it('exclui histórico após confirmação', async () => {
        vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue({
            ...resumoSemHistorico,
            temHistorico: true,
        });

        await clienteService.excluirPorId('cliente-1', true);

        expect(clienteRepository.excluirComHistorico).toHaveBeenCalledWith(
            'cliente-1',
        );
    });

    it('captura IDs antes da exclusão e tolera falha ao enfileirar', async () => {
        habilitarGoogleSync();
        vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue({
            ...resumoSemHistorico,
            temHistorico: true,
        });
        googleSyncMocks.listarIdsPorCliente.mockResolvedValue([
            'agendamento-1',
        ]);
        googleSyncMocks.enfileirarSincronizacao.mockRejectedValueOnce(
            new Error('outbox unavailable'),
        );

        await expect(
            clienteService.excluirPorId('cliente-1', true),
        ).resolves.toBeUndefined();

        expect(
            googleSyncMocks.listarIdsPorCliente.mock.invocationCallOrder[0],
        ).toBeLessThan(
            vi.mocked(clienteRepository.excluirComHistorico).mock
                .invocationCallOrder[0],
        );
        expect(googleSyncMocks.enfileirarSincronizacao).toHaveBeenCalledWith([
            'agendamento-1',
        ]);
    });

    it('não consulta agendamentos quando flag está desligada', async () => {
        vi.stubEnv('GOOGLE_CALENDAR_SYNC_ENABLED', 'false');
        vi.mocked(clienteRepository.buscarPorId).mockResolvedValue(
            clienteExistente as never,
        );
        vi.mocked(clienteRepository.buscarPorTelefone).mockResolvedValue(null);
        vi.mocked(clienteRepository.atualizar).mockResolvedValue(
            clienteExistente as never,
        );

        await clienteService.atualizar('cliente-1', {
            nome: 'Maria',
            telefone: '19974191311',
        });

        expect(
            googleSyncMocks.listarIdsFuturosPorCliente,
        ).not.toHaveBeenCalled();
        expect(googleSyncMocks.enfileirarSincronizacao).not.toHaveBeenCalled();
    });

    it.each(['pacote ativo', 'agendamento futuro em aberto'])(
        'bloqueia exclusão com %s mesmo confirmado',
        async (descricao) => {
            vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue({
                ...resumoSemHistorico,
                impedimentos: [descricao],
            });

            await expect(
                clienteService.excluirPorId('cliente-1', true),
            ).rejects.toMatchObject({
                message:
                    'Não é possível excluir cliente com pacote ativo ou agendamentos futuros em aberto.',
                statusCode: 409,
            });
            expect(
                clienteRepository.excluirComHistorico,
            ).not.toHaveBeenCalled();
        },
    );

    it('permite passado não cancelado quando não existe impedimento', async () => {
        vi.mocked(clienteRepository.obterResumoExclusao).mockResolvedValue({
            ...resumoSemHistorico,
            agendamentos: { ...resumoSemHistorico.agendamentos, passados: 1 },
            temHistorico: true,
        });

        await clienteService.excluirPorId('cliente-1', true);

        expect(clienteRepository.excluirComHistorico).toHaveBeenCalledTimes(1);
    });
});
