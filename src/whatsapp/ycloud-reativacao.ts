import type { ReativacaoButtonAction } from './types';

export const REATIVACAO_PAYLOAD_AGENDAR = 'reativacao:agendar';
export const REATIVACAO_PAYLOAD_OPTOUT = 'reativacao:optout';
export const REATIVACAO_TEXTO_BOTAO_AGENDAR = 'Quero agendar';
export const REATIVACAO_TEXTO_BOTAO_OPTOUT = 'Não receber mais';
export const REATIVACAO_TEXTO_SINTETICO = 'Quero agendar um horário';
export const REATIVACAO_TEXTO_CONFIRMACAO_OPTOUT =
    'Combinado! Não vamos mais te enviar mensagens promocionais. Se quiser agendar, é só escrever por aqui.';
export const REATIVACAO_TEMPLATE_NOME = 'notificar_inativo';
export const REATIVACAO_TEMPLATE_IDIOMA = 'pt_BR';
export const TEXTO_TEMPLATE_REATIVACAO = `Olá! Aqui é da **Barbearia Léo Almeida**!

Faz um tempo que você não passa por aqui. Que tal dar um trato no visual?

Toque em "Quero agendar" e a gente encontra um horário que caiba na sua rotina.

Para parar de receber, toque em "Não receber mais"`;

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
