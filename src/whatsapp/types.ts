export type IncomingWhatsAppMessageKind =
    | 'text'
    | 'non_text'
    | 'button_reply'
    | 'unknown';

export type ReativacaoButtonAction = 'agendar' | 'optout';

export interface LembreteButtonAction {
    type: 'lembrete';
    action: 'confirmar' | 'remarcar';
    agendamentoId: string;
}

export interface IncomingWhatsAppButtonReply {
    payload: string | null;
    text: string | null;
    contextId: string | null;
    action: ReativacaoButtonAction | LembreteButtonAction | null;
}

export interface IncomingWhatsAppMessageMedia {
    link: string | null;
    id: string | null;
    sha256: string | null;
    mimeType: string | null;
}

export interface IncomingWhatsAppMessage {
    provider: string;
    messageId: string | null;
    phone: string | null;
    alternateUserId: string | null;
    kind: IncomingWhatsAppMessageKind;
    rawType: string | null;
    rawSubtype: string | null;
    text: string | null;
    buttonReply?: IncomingWhatsAppButtonReply | null;
    media?: IncomingWhatsAppMessageMedia | null;
    isGroup: boolean;
    isFromMe: boolean;
}
