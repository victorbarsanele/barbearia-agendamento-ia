import { normalizarTelefone } from '../utils/telefone';
import { getWhatsAppProvider } from '../whatsapp/config';
import {
    sendYCloudTemplate,
    YCloudTemplateParameter,
} from '../whatsapp/ycloud-outbound.adapter';
import { sendWhatsAppText } from '../whatsapp/whatsapp-outbound.service';

export type WhatsAppNotificationType =
    | 'reagendamento'
    | 'cancelamento'
    | 'atendimento_humano';

export type WhatsAppNotificationParameters =
    | {
          tipo: 'reagendamento';
          nomeCliente: string;
          novaData: string;
          novoHorario: string;
          novoHorarioCompleto: string;
          servico: string;
          contatoBarbeiro: string;
      }
    | {
          tipo: 'cancelamento';
          nomeCliente: string;
          data: string;
          horario: string;
          dataHoraCompleta: string;
          servico: string;
          contatoBarbeiro: string;
      }
    | {
          tipo: 'atendimento_humano';
          telefoneCliente: string;
          motivo: string;
      };

type RebookingParameters = Omit<
    Extract<WhatsAppNotificationParameters, { tipo: 'reagendamento' }>,
    'tipo'
>;
type CancellationParameters = Omit<
    Extract<WhatsAppNotificationParameters, { tipo: 'cancelamento' }>,
    'tipo'
>;
type HumanSupportParameters = Omit<
    Extract<WhatsAppNotificationParameters, { tipo: 'atendimento_humano' }>,
    'tipo'
>;

const TEMPLATE_NAMES: Record<WhatsAppNotificationType, string> = {
    reagendamento: 'aviso_reagendamento',
    cancelamento: 'aviso_cancelamento',
    atendimento_humano: 'aviso_atendimento_humano',
};

function sanitizeParameter(value: string): string {
    const sanitized = value
        .replace(/[\r\n\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);

    return sanitized || 'não informado';
}

function buildLegacyText(parameters: WhatsAppNotificationParameters): string {
    if (parameters.tipo === 'reagendamento') {
        return [
            `Olá ${parameters.nomeCliente}! Seu agendamento foi remarcado pelo barbeiro.`,
            `Nova data: ${parameters.novaData}`,
            `Novo horário: ${parameters.novoHorario} (horário de Brasília)`,
            `Serviço: ${parameters.servico}`,
            `Dúvidas? Entre em contato com o barbeiro: ${parameters.contatoBarbeiro}`,
        ].join('\n');
    }

    if (parameters.tipo === 'cancelamento') {
        return [
            `Olá ${parameters.nomeCliente}! Seu agendamento foi cancelado pelo barbeiro.`,
            `Data: ${parameters.data}`,
            `Horário: ${parameters.horario} (horário de Brasília)`,
            `Serviço: ${parameters.servico}`,
            `Dúvidas? Entre em contato com o barbeiro: ${parameters.contatoBarbeiro}`,
        ].join('\n');
    }

    return `Cliente ${parameters.telefoneCliente} precisa de atendimento manual (${parameters.motivo}).`;
}

function buildTemplateParameters(
    parameters: WhatsAppNotificationParameters,
): YCloudTemplateParameter[] {
    const values =
        parameters.tipo === 'reagendamento'
            ? [
                  parameters.nomeCliente,
                  parameters.novoHorarioCompleto,
                  parameters.servico,
                  parameters.contatoBarbeiro,
              ]
            : parameters.tipo === 'cancelamento'
              ? [
                    parameters.nomeCliente,
                    parameters.dataHoraCompleta,
                    parameters.servico,
                    parameters.contatoBarbeiro,
                ]
              : [parameters.telefoneCliente, parameters.motivo];

    return values.map((value) => ({
        type: 'text',
        text: sanitizeParameter(value),
    }));
}

export async function enviarNotificacaoWhatsApp(
    tipo: 'reagendamento',
    destinatario: string,
    parametros: RebookingParameters,
): Promise<string | null>;
export async function enviarNotificacaoWhatsApp(
    tipo: 'cancelamento',
    destinatario: string,
    parametros: CancellationParameters,
): Promise<string | null>;
export async function enviarNotificacaoWhatsApp(
    tipo: 'atendimento_humano',
    destinatario: string,
    parametros: HumanSupportParameters,
): Promise<string | null>;
export async function enviarNotificacaoWhatsApp(
    tipo: WhatsAppNotificationType,
    destinatario: string,
    parametros:
        | RebookingParameters
        | CancellationParameters
        | HumanSupportParameters,
): Promise<string | null> {
    const notification = { ...parametros, tipo } as WhatsAppNotificationParameters;

    if (getWhatsAppProvider() === 'evolution') {
        const text = buildLegacyText(notification);
        await sendWhatsAppText(destinatario, text);
        return tipo === 'atendimento_humano' ? null : text;
    }

    const phone = normalizarTelefone(destinatario);
    if (!phone) {
        throw new Error('Destinatário WhatsApp inválido.');
    }

    if (process.env.SIMULACAO_WEBHOOK === 'true') {
        console.log(
            `[SIMULACAO WEBHOOK] Destinatário: ${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`,
        );
        return null;
    }

    await sendYCloudTemplate(
        phone,
        TEMPLATE_NAMES[tipo],
        buildTemplateParameters(notification),
    );
    return null;
}
