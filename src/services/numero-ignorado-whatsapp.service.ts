import * as clienteRepository from '../repositories/cliente.repository';
import { getNumeroIgnoradoWhatsAppRepository } from '../repositories/numero-ignorado-whatsapp.repository';
import { AppError } from '../lib/app-error';
import {
    canonicalizarTelefoneWhatsApp,
    validarTelefoneCelularBrasileiro,
    variantesTelefoneWhatsApp,
} from '../utils/telefone';

function isUniqueConstraintError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
    );
}

function conflito(mensagem: string, code: string): AppError {
    return new AppError(mensagem, 409, { code });
}

export async function listar() {
    return getNumeroIgnoradoWhatsAppRepository().listar();
}

export async function criar(data: {
    telefone: string;
    rotulo: string;
    confirmarMesmoSendoCliente?: boolean;
}) {
    const telefone = canonicalizarTelefoneWhatsApp(data.telefone);
    if (!validarTelefoneCelularBrasileiro(telefone)) {
        throw new AppError('Telefone WhatsApp inválido.', 400, {
            code: 'TELEFONE_INVALIDO',
        });
    }

    const rotulo = data.rotulo.trim();
    if (rotulo.length < 1 || rotulo.length > 60) {
        throw new AppError('Rótulo deve ter entre 1 e 60 caracteres.', 400, {
            code: 'ROTULO_INVALIDO',
        });
    }

    const repository = getNumeroIgnoradoWhatsAppRepository();
    if (await repository.existePorTelefone(telefone)) {
        throw conflito(
            'Número já cadastrado na lista.',
            'NUMERO_JA_CADASTRADO',
        );
    }

    if (!data.confirmarMesmoSendoCliente) {
        const variantes = variantesTelefoneWhatsApp(telefone);
        const clientes = await Promise.all(
            variantes.map((variante) =>
                clienteRepository.buscarPorTelefone(variante),
            ),
        );
        if (clientes.some(Boolean)) {
            throw conflito(
                'Número pertence a cliente cadastrado.',
                'NUMERO_E_CLIENTE',
            );
        }
    }

    try {
        return await repository.criar({ telefone, rotulo });
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            throw conflito(
                'Número já cadastrado na lista.',
                'NUMERO_JA_CADASTRADO',
            );
        }
        throw error;
    }
}

export async function excluirPorId(id: string): Promise<void> {
    const excluido =
        await getNumeroIgnoradoWhatsAppRepository().excluirPorId(id);
    if (!excluido) {
        throw new AppError('Número ignorado não encontrado.', 404, {
            code: 'NUMERO_IGNORADO_NAO_ENCONTRADO',
        });
    }
}

export async function numeroEstaIgnorado(phone: string): Promise<boolean> {
    const telefone = canonicalizarTelefoneWhatsApp(phone);
    if (!telefone) {
        return false;
    }
    return getNumeroIgnoradoWhatsAppRepository().existePorTelefone(telefone);
}
