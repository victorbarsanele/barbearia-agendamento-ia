import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../lib/app-error';
import {
    getNumeroIgnoradoWhatsAppRepository,
    setNumeroIgnoradoWhatsAppRepository,
    type NumeroIgnoradoWhatsAppRepository,
} from '../repositories/numero-ignorado-whatsapp.repository';
import * as clienteRepository from '../repositories/cliente.repository';
import { criar, numeroEstaIgnorado } from './numero-ignorado-whatsapp.service';

vi.mock('../repositories/cliente.repository', () => ({
    buscarPorTelefone: vi.fn(),
}));

const clienteMock = vi.mocked(clienteRepository.buscarPorTelefone);
const criarMock = vi.fn();
const existeMock = vi.fn();
const excluirMock = vi.fn();
const listarMock = vi.fn();

const repository: NumeroIgnoradoWhatsAppRepository = {
    listar: listarMock,
    criar: criarMock,
    excluirPorId: excluirMock,
    existePorTelefone: existeMock,
};

beforeEach(() => {
    setNumeroIgnoradoWhatsAppRepository(repository);
    vi.clearAllMocks();
    clienteMock.mockResolvedValue(null);
    existeMock.mockResolvedValue(false);
    criarMock.mockResolvedValue({
        id: 'ignored-1',
        telefone: '5511998765432',
        rotulo: 'Contato',
        criadoEm: new Date('2026-10-28T12:00:00.000Z'),
    });
});

describe('numero-ignorado-whatsapp.service', () => {
    it('canonicaliza telefone e limpa rótulo antes de criar', async () => {
        await criar({
            telefone: '+55 (11) 98765-4321',
            rotulo: '  Eletricista  ',
        });

        expect(criarMock).toHaveBeenCalledWith({
            telefone: '5511987654321',
            rotulo: 'Eletricista',
        });
        expect(getNumeroIgnoradoWhatsAppRepository()).toBe(repository);
    });

    it('rejeita telefone inválido e rótulo vazio ou longo', async () => {
        await expect(
            criar({ telefone: '123', rotulo: 'Contato' }),
        ).rejects.toMatchObject({
            statusCode: 400,
            details: { code: 'TELEFONE_INVALIDO' },
        });
        await expect(
            criar({ telefone: '11987654321', rotulo: '   ' }),
        ).rejects.toMatchObject({
            statusCode: 400,
            details: { code: 'ROTULO_INVALIDO' },
        });
        await expect(
            criar({ telefone: '11987654321', rotulo: 'x'.repeat(61) }),
        ).rejects.toBeInstanceOf(AppError);
        expect(criarMock).not.toHaveBeenCalled();
    });

    it('rejeita duplicata encontrada antes do insert', async () => {
        existeMock.mockResolvedValue(true);

        await expect(
            criar({ telefone: '11987654321', rotulo: 'Contato' }),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: { code: 'NUMERO_JA_CADASTRADO' },
        });
        expect(criarMock).not.toHaveBeenCalled();
    });

    it('converte P2002 concorrente em NUMERO_JA_CADASTRADO', async () => {
        criarMock.mockRejectedValueOnce(
            Object.assign(new Error(), { code: 'P2002' }),
        );

        await expect(
            criar({ telefone: '11987654321', rotulo: 'Contato' }),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: { code: 'NUMERO_JA_CADASTRADO' },
        });
    });

    it('detecta Cliente salvo sem nono dígito e permite confirmação explícita', async () => {
        clienteMock.mockImplementation(async (phone) =>
            phone === '551198765432' ? ({ id: 'cliente-1' } as never) : null,
        );

        await expect(
            criar({ telefone: '5511998765432', rotulo: 'Parente' }),
        ).rejects.toMatchObject({
            statusCode: 409,
            details: { code: 'NUMERO_E_CLIENTE' },
        });

        await criar({
            telefone: '5511998765432',
            rotulo: 'Parente',
            confirmarMesmoSendoCliente: true,
        });
        expect(criarMock).toHaveBeenCalledWith({
            telefone: '5511998765432',
            rotulo: 'Parente',
        });
    });

    it.each(['5511998765432', '551198765432'])(
        'detecta Cliente em variante %s ao cadastrar número legado',
        async (telefoneCliente) => {
            clienteMock.mockImplementation(async (phone) =>
                phone === telefoneCliente
                    ? ({ id: 'cliente-1' } as never)
                    : null,
            );

            await expect(
                criar({ telefone: '551198765432', rotulo: 'Contato' }),
            ).rejects.toMatchObject({
                statusCode: 409,
                details: { code: 'NUMERO_E_CLIENTE' },
            });
        },
    );

    it('consulta lista usando telefone canonizado e não consulta vazio', async () => {
        existeMock.mockResolvedValueOnce(true);
        await expect(numeroEstaIgnorado('+55 (11) 98765-4321')).resolves.toBe(
            true,
        );
        expect(existeMock).toHaveBeenCalledWith('5511987654321');

        await expect(numeroEstaIgnorado('abc')).resolves.toBe(false);
        expect(existeMock).toHaveBeenCalledTimes(1);
    });
});
