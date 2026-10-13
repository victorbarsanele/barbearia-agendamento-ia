export type IncomingWhatsAppMessageKind = 'text' | 'non_text' | 'unknown';

export interface IncomingWhatsAppMessage {
    provider: string;
    messageId: string | null;
    phone: string | null;
    alternateUserId: string | null;
    kind: IncomingWhatsAppMessageKind;
    rawType: string | null;
    rawSubtype: string | null;
    text: string | null;
    isGroup: boolean;
    isFromMe: boolean;
}
