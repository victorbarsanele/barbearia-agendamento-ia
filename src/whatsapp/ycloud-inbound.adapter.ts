import { normalizarTelefone } from '../utils/telefone';
import { IncomingWhatsAppMessage } from './types';

type AnyRecord = Record<string, unknown>;

export type YCloudWebhookEvent =
    | { kind: 'message'; message: IncomingWhatsAppMessage }
    | { kind: 'echo'; messageId: string | null }
    | { kind: 'ignored' };

function asRecord(value: unknown): AnyRecord | null {
    return typeof value === 'object' && value !== null
        ? (value as AnyRecord)
        : null;
}

function stringField(record: AnyRecord | null, field: string): string | null {
    const value = record?.[field];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

export function canonicalizeYCloudPhone(value: string): string | null {
    const digits = value.replace(/\D/g, '');

    if (digits.length === 10 || digits.length === 11) {
        return normalizarTelefone(digits);
    }

    if (
        digits.length === 12 &&
        digits.startsWith('55') &&
        /^[6-9]/.test(digits[4] ?? '')
    ) {
        return `${digits.slice(0, 4)}9${digits.slice(4)}`;
    }

    return digits || null;
}

export function parseYCloudWebhookEvent(body: unknown): YCloudWebhookEvent {
    const root = asRecord(body);
    const eventType = stringField(root, 'type');

    if (eventType === 'whatsapp.smb.message.echoes') {
        const eventPayload =
            asRecord(root?.whatsappSMBMessage) ??
            asRecord(root?.whatsappMessage) ??
            asRecord(root?.data) ??
            root;

        return {
            kind: 'echo',
            messageId:
                stringField(eventPayload, 'wamid') ??
                stringField(eventPayload, 'id'),
        };
    }

    if (eventType !== 'whatsapp.inbound_message.received') {
        return { kind: 'ignored' };
    }

    const payload = asRecord(root?.whatsappInboundMessage);
    if (!payload) {
        return { kind: 'ignored' };
    }

    const messageType = stringField(payload, 'type');
    const textRecord = asRecord(payload.text);
    const text = messageType === 'text' ? stringField(textRecord, 'body') : null;
    const from = stringField(payload, 'from');

    return {
        kind: 'message',
        message: {
            provider: 'ycloud',
            messageId:
                stringField(payload, 'wamid') ?? stringField(payload, 'id'),
            phone: from ? canonicalizeYCloudPhone(from) : null,
            alternateUserId: stringField(payload, 'fromUserId'),
            text,
            isGroup: false,
            isFromMe: false,
        },
    };
}
