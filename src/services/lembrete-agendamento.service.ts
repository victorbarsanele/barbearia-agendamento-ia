import { StatusAgendamento } from '@prisma/client';
import type { LembreteButtonAction } from '../whatsapp/types';
import { AppError } from '../lib/app-error';
import {
    getLembreteAgendamentoRepository,
    type AgendamentoParaLembrete,
    type ResultadoReservaLembrete,
} from '../repositories/lembrete-agendamento.repository';
import { numeroEstaIgnorado } from './numero-ignorado-whatsapp.service';
import { getWhatsAppAllowlist } from '../whatsapp/allowlist';
import { getWhatsAppProvider } from '../whatsapp/config';
import { canonicalizeYCloudPhone } from '../whatsapp/ycloud-inbound.adapter';
import {
    sendYCloudTemplate,
    type YCloudTemplateButtonComponent,
    type YCloudTemplateParameter,
} from '../whatsapp/ycloud-outbound.adapter';
import {
    criarPayloadLembrete,
    LEMBRETE_TEMPLATE_IDIOMA,
    LEMBRETE_TEMPLATE_NOME,
    LEMBRETE_TEXTO_CONFIRMAR,
    LEMBRETE_TEXTO_INATIVO,
    LEMBRETE_TEXTO_REMARCAR,
} from '../whatsapp/ycloud-lembrete';

const TIME_ZONE = 'America/Sao_Paulo';
const STATUS_ATIVO: StatusAgendamento[] = [
    StatusAgendamento.AGENDADO,
    StatusAgendamento.CONFIRMADO,
];

function erroReserva(
    resultado: Exclude<ResultadoReservaLembrete, { ok: true }>,
): AppError {
    if (resultado.motivo === 'AGENDAMENTO_NAO_ENCONTRADO') {
        return new AppError('Agendamento não encontrado.', 404, {
            motivo: 'AGENDAMENTO_NAO_ENCONTRADO',
        });
    }
    if (resultado.motivo === 'AGENDAMENTO_NAO_ATIVO') {
        return new AppError(
            'Agendamento não está elegível para lembrete.',
            409,
            {
                motivo: 'AGENDAMENTO_NAO_ATIVO',
            },
        );
    }
    if (resultado.motivo === 'LEMBRETE_PENDENTE') {
        return new AppError(
            'Já existe um envio de lembrete em andamento.',
            409,
            {
                motivo: 'LEMBRETE_PENDENTE',
            },
        );
    }
    return new AppError('Lembrete já foi aceito pela YCloud.', 409, {
        motivo: 'LEMBRETE_JA_ENVIADO',
    });
}

function formatarData(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: TIME_ZONE,
    }).format(data);
}

function formatarHorario(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIME_ZONE,
    }).format(data);
}

export function montarParametrosTemplateLembrete(
    agendamento: Pick<AgendamentoParaLembrete, 'dataHoraInicio' | 'servico'>,
): YCloudTemplateParameter[] {
    return [
        agendamento.servico.nome,
        formatarData(agendamento.dataHoraInicio),
        formatarHorario(agendamento.dataHoraInicio),
    ].map((text) => ({ type: 'text', text }));
}

export function montarBotoesTemplateLembrete(
    agendamentoId: string,
): YCloudTemplateButtonComponent[] {
    return (['confirmar', 'remarcar'] as const).map((action, index) => ({
        type: 'button',
        sub_type: 'quick_reply',
        index: index as 0 | 1,
        parameters: [
            {
                type: 'payload',
                payload: criarPayloadLembrete(action, agendamentoId),
            },
        ],
    }));
}

function obterTelefone(agendamento: AgendamentoParaLembrete): string {
    const telefone = canonicalizeYCloudPhone(agendamento.cliente.telefone);
    if (!telefone) {
        throw new AppError('Telefone do cliente inválido.', 422, {
            motivo: 'TELEFONE_INVALIDO',
        });
    }
    return telefone;
}

function validarElegibilidade(
    agendamento: AgendamentoParaLembrete,
    agora: Date,
): void {
    if (
        !STATUS_ATIVO.includes(agendamento.status) ||
        agendamento.dataHoraInicio <= agora
    ) {
        throw new AppError(
            'Agendamento não está elegível para lembrete.',
            409,
            {
                motivo: 'AGENDAMENTO_NAO_ATIVO',
            },
        );
    }
}

function validarReserva(
    resultado: ResultadoReservaLembrete,
): asserts resultado is Extract<ResultadoReservaLembrete, { ok: true }> {
    if (!resultado.ok) {
        throw erroReserva(resultado);
    }
}

function esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function descreverErro(error: unknown): string {
    return error instanceof Error
        ? error.message.replace(/[\r\n\t]/g, ' ').slice(0, 200)
        : 'Erro desconhecido.';
}

export async function enviarLembreteAgendamento(
    agendamentoId: string,
    agora = new Date(),
): Promise<{ status: 'ACEITO'; aceitoEm: Date }> {
    const repository = getLembreteAgendamentoRepository();
    const agendamento = await repository.obterAgendamento(agendamentoId);
    if (!agendamento) {
        throw new AppError('Agendamento não encontrado.', 404, {
            motivo: 'AGENDAMENTO_NAO_ENCONTRADO',
        });
    }
    validarElegibilidade(agendamento, agora);

    const telefone = obterTelefone(agendamento);
    if (await numeroEstaIgnorado(telefone)) {
        throw new AppError('Número está na lista de números ignorados.', 422, {
            motivo: 'NUMERO_IGNORADO',
        });
    }
    if (getWhatsAppProvider() !== 'ycloud') {
        throw new AppError(
            'Provedor ativo não oferece suporte a templates.',
            503,
            {
                motivo: 'PROVEDOR_SEM_SUPORTE',
            },
        );
    }
    const allowlist = getWhatsAppAllowlist();
    if (allowlist.active && !allowlist.phones.has(telefone)) {
        throw new AppError('Telefone fora da allowlist do WhatsApp.', 422, {
            motivo: 'FORA_DA_ALLOWLIST',
        });
    }

    const reserva = await repository.reservar(agendamentoId, agora);
    validarReserva(reserva);
    const aceitoEm = new Date();
    let providerMessageId: string;

    try {
        const response = await sendYCloudTemplate(
            telefone,
            LEMBRETE_TEMPLATE_NOME,
            montarParametrosTemplateLembrete(reserva.agendamento),
            montarBotoesTemplateLembrete(agendamentoId),
        );
        if (!response.id?.trim()) {
            throw new Error('Resposta YCloud sem ID da mensagem.');
        }
        providerMessageId = response.id;
    } catch (error) {
        const motivo = descreverErro(error);
        try {
            await repository.marcarFalhou(reserva.envioId, motivo);
        } catch (persistError) {
            console.error(
                '[LEMBRETE] Falha ao registrar tentativa como falha.',
                {
                    agendamentoId,
                    tentativaId: reserva.envioId,
                    providerMessageId: null,
                    motivoFalha: motivo,
                    erro: descreverErro(persistError),
                },
            );
        }
        throw new AppError('Falha ao enviar lembrete.', 502, {
            motivo: 'FALHA_ENVIO',
        });
    }

    for (let tentativa = 1; tentativa <= 3; tentativa += 1) {
        try {
            await repository.marcarAceito(
                reserva.envioId,
                providerMessageId,
                aceitoEm,
            );
            return { status: 'ACEITO', aceitoEm };
        } catch (error) {
            if (tentativa < 3) {
                await esperar(tentativa * 100);
                continue;
            }
            console.error(
                '[LEMBRETE] Envio aceito, mas falha ao persistir estado.',
                {
                    agendamentoId,
                    tentativaId: reserva.envioId,
                    providerMessageId,
                    erro: descreverErro(error),
                },
            );
        }
    }

    throw new AppError(
        'Lembrete enviado; falha ao registrar o estado. Verifique antes de reenviar.',
        500,
        { motivo: 'FALHA_REGISTRO_LEMBRETE_ACEITO' },
    );
}

export async function processarCliqueLembrete(
    telefone: string,
    action: LembreteButtonAction,
    agora = new Date(),
): Promise<string> {
    const repository = getLembreteAgendamentoRepository();
    const agendamento = await repository.obterAgendamento(action.agendamentoId);
    if (
        !agendamento ||
        !STATUS_ATIVO.includes(agendamento.status) ||
        canonicalizeYCloudPhone(agendamento.cliente.telefone) !==
            canonicalizeYCloudPhone(telefone)
    ) {
        return LEMBRETE_TEXTO_INATIVO;
    }

    if (action.action === 'confirmar') {
        const confirmado = await repository.confirmarPorCliente(
            action.agendamentoId,
            telefone,
            agora,
        );
        return confirmado ? LEMBRETE_TEXTO_CONFIRMAR : LEMBRETE_TEXTO_INATIVO;
    }

    const registrado = await repository.registrarContextoRemarcacao(
        telefone,
        action.agendamentoId,
        new Date(agora.getTime() + 24 * 60 * 60 * 1000),
        agora,
    );
    return registrado ? LEMBRETE_TEXTO_REMARCAR : LEMBRETE_TEXTO_INATIVO;
}

export async function consumirContextoRemarcacao(
    telefone: string,
    agora = new Date(),
): Promise<string | undefined> {
    const contexto =
        await getLembreteAgendamentoRepository().consumirContextoRemarcacao(
            telefone,
            agora,
        );
    if (!contexto) return undefined;

    return [
        'Contexto de remarcação solicitado pelo cliente para o agendamento atual:',
        `Serviço atual: ${contexto.servico}.`,
        `Data e horário atuais: ${formatarData(contexto.dataHoraInicio)} às ${formatarHorario(contexto.dataHoraInicio)}.`,
        'Não altere nem cancele o agendamento sem confirmação explícita; siga fluxo normal de disponibilidade e remarcação.',
    ].join('\n');
}
