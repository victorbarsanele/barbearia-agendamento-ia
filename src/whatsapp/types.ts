export interface IncomingWhatsAppMessage {
    provider: string;
    messageId: string | null;
    phone: string | null;
    alternateUserId: string | null;
    text: string | null;
    isGroup: boolean;
    isFromMe: boolean;
}
