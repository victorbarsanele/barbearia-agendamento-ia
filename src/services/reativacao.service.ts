import * as clienteRepository from '../repositories/cliente.repository';
import {
    getReativacaoRepository,
    type ResultadoReservaReativacao,
} from '../repositories/reativacao.repository';
import { AppError } from '../lib/app-error';
import { addToHistory } from './gemini.service';
import { numeroEstaIgnorado } from './numero-ignorado-whatsapp.service';
import { getWhatsAppAllowlist } from '../whatsapp/allowlist';
import { getWhatsAppProvider } from '../whatsapp/config';
import { canonicalizeYCloudPhone } from '../whatsapp/ycloud-inbound.adapter';
import {
    sendYCloudTemplate,
    type YCloudTemplateButtonComponent,
} from '../whatsapp/ycloud-outbound.adapter';
import {
    REATIVACAO_PAYLOAD_AGENDAR,
    REATIVACAO_PAYLOAD_OPTOUT,
    REATIVACAO_TEMPLATE_IDIOMA,
    REATIVACAO_TEMPLATE_NOME,
    TEXTO_TEMPLATE_REATIVACAO,
} from '../whatsapp/ycloud-reativacao';

export interface ReativacaoResultado {
    envioId: string;
    status: 'ACEITA';
}

function erroReserva(
    resultado: Exclude<ResultadoReservaReativacao, { ok: true }>,
): AppError {
    if (resultado.motivo === 'CLIENTE_NAO_ENCONTRADO') {
        return new AppError('Cliente não encontrado.', 404, {
            motivo: 'CLIENTE_NAO_ENCONTRADO',
        });
    }
    if (resultado.motivo === 'OPT_OUT') {
        return new AppError('Cliente optou por não receber marketing.', 409, {
            motivo: 'OPT_OUT',
        });
    }
    return new AppError('Cliente está no período de cooldown.', 409, {
        motivo: 'COOLDOWN',
        ...(resultado.ate ? { bloqueadoAte: resultado.ate } : {}),
    });
}

function getMotivoFalha(error: unknown): string {
    if (!(error instanceof Error)) {
        return 'Falha no envio YCloud.';
    }
    return error.message.replace(/[\r\n\t]/g, ' ').slice(0, 200);
}

export async function reativarCliente(
    clienteId: string,
    agora = new Date(),
): Promise<ReativacaoResultado> {
    const cliente = await clienteRepository.buscarPorId(clienteId);
    if (!cliente) {
        throw new AppError('Cliente não encontrado.', 404, {
            motivo: 'CLIENTE_NAO_ENCONTRADO',
        });
    }

    if (!cliente.telefone.trim()) {
        throw new AppError('Cliente não possui telefone.', 422, {
            motivo: 'TELEFONE_AUSENTE',
        });
    }
    const telefone = canonicalizeYCloudPhone(cliente.telefone);
    if (!telefone) {
        throw new AppError('Telefone do cliente inválido.', 422, {
            motivo: 'TELEFONE_INVALIDO',
        });
    }

    if (await numeroEstaIgnorado(telefone)) {
        throw new AppError('Número está na lista de números ignorados.', 422, {
            motivo: 'NUMERO_IGNORADO',
        });
    }

    if (getWhatsAppProvider() !== 'ycloud') {
        throw new AppError(
            'Provedor ativo não oferece suporte a templates de marketing.',
            503,
            { motivo: 'PROVEDOR_SEM_SUPORTE' },
        );
    }

    const allowlist = getWhatsAppAllowlist();
    if (allowlist.active && !allowlist.phones.has(telefone)) {
        throw new AppError('Telefone fora da allowlist do WhatsApp.', 422, {
            motivo: 'FORA_DA_ALLOWLIST',
        });
    }

    const repository = getReativacaoRepository();
    const reserva = await repository.reservarEnvioReativacao(clienteId, agora);
    if (!reserva.ok) {
        throw erroReserva(reserva);
    }

    const buttonComponents: YCloudTemplateButtonComponent[] = [
        {
            type: 'button',
            sub_type: 'quick_reply',
            index: 0,
            parameters: [
                { type: 'payload', payload: REATIVACAO_PAYLOAD_AGENDAR },
            ],
        },
        {
            type: 'button',
            sub_type: 'quick_reply',
            index: 1,
            parameters: [
                { type: 'payload', payload: REATIVACAO_PAYLOAD_OPTOUT },
            ],
        },
    ];

    let response: Awaited<ReturnType<typeof sendYCloudTemplate>>;
    try {
        response = await sendYCloudTemplate(
            telefone,
            REATIVACAO_TEMPLATE_NOME,
            [],
            buttonComponents,
        );
        if (!response.id?.trim()) {
            throw new Error('Resposta YCloud sem ID da mensagem.');
        }
    } catch (error) {
        const motivoFalha = getMotivoFalha(error);
        try {
            await repository.marcarEnvioFalhou(reserva.envioId, motivoFalha);
        } catch {
            console.error(
                '[REATIVACAO] Falha ao registrar tentativa de envio falha.',
            );
        }
        throw new AppError('Falha ao enviar template de reativação.', 502, {
            motivo: 'FALHA_ENVIO',
        });
    }

    await repository.marcarEnvioAceito(reserva.envioId, response.id);
    addToHistory(telefone, 'model', TEXTO_TEMPLATE_REATIVACAO);

    return { envioId: reserva.envioId, status: 'ACEITA' };
}
