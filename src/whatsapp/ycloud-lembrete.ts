import type { LembreteButtonAction } from './types';

export const LEMBRETE_TEMPLATE_NOME = 'lembrete_agendamento_v2';
export const LEMBRETE_TEMPLATE_IDIOMA = 'pt_BR';
export const LEMBRETE_TEXTO_CONFIRMAR = 'Certo! Estaremos no seu aguardo!';
export const LEMBRETE_TEXTO_REMARCAR =
    'Tudo bem, deseja remarcar para o mesmo serviço? E para qual dia?';
export const LEMBRETE_TEXTO_INATIVO = 'Esse agendamento não está mais ativo.';

export function criarPayloadLembrete(
    action: LembreteButtonAction['action'],
    agendamentoId: string,
): string {
    return `lembrete:${action}:${agendamentoId}`;
}

export function resolverAcaoBotaoLembrete(
    payload: string | null,
): LembreteButtonAction | null {
    const match = payload
        ?.trim()
        .match(/^lembrete:(confirmar|remarcar):([\w-]+)$/);
    if (!match) {
        return null;
    }

    return {
        type: 'lembrete',
        action: match[1] as LembreteButtonAction['action'],
        agendamentoId: match[2]!,
    };
}
