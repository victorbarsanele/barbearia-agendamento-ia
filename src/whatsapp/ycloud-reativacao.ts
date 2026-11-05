import type { ReativacaoButtonAction } from './types';

export const REATIVACAO_PAYLOAD_AGENDAR = 'reativacao:agendar';
export const REATIVACAO_PAYLOAD_OPTOUT = 'reativacao:optout';
export const REATIVACAO_TEXTO_BOTAO_AGENDAR = 'Quero agendar';
export const REATIVACAO_TEXTO_BOTAO_OPTOUT = 'Não receber mais';
export const REATIVACAO_TEXTO_SINTETICO = 'Quero agendar um horário';
export const REATIVACAO_TEXTO_CONFIRMACAO_OPTOUT =
    'Combinado! Não vamos mais te enviar mensagens promocionais. Se quiser agendar, é só escrever por aqui.';

export function resolverAcaoBotaoReativacao(
    payload: string | null,
    text: string | null,
): ReativacaoButtonAction | null {
    const normalizedPayload = payload?.trim();
    if (normalizedPayload === REATIVACAO_PAYLOAD_AGENDAR) {
        return 'agendar';
    }
    if (normalizedPayload === REATIVACAO_PAYLOAD_OPTOUT) {
        return 'optout';
    }

    const normalizedText = text?.trim().toLocaleLowerCase('pt-BR');
    if (
        normalizedText ===
        REATIVACAO_TEXTO_BOTAO_AGENDAR.toLocaleLowerCase('pt-BR')
    ) {
        return 'agendar';
    }
    if (
        normalizedText ===
        REATIVACAO_TEXTO_BOTAO_OPTOUT.toLocaleLowerCase('pt-BR')
    ) {
        return 'optout';
    }

    return null;
}
