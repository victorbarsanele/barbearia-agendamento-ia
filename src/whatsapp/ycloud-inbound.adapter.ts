import { normalizarTelefone } from '../utils/telefone';
import { IncomingWhatsAppMessage } from './types';

type AnyRecord = Record<string, unknown>;
const YCLOUD_NON_TEXT_TYPES = [
    'image',
    'video',
    'audio',
    'document',
    'sticker',
    'location',
    'contacts',
    'contact',
] as const;

export type YCloudWebhookEvent =
    | { kind: 'message'; message: IncomingWhatsAppMessage }
    | {
          kind: 'echo';
          messageId: string | null;
          phone: string | null;
          sendTime: Date | null;
          messageType: string | null;
          structure: YCloudEchoStructure;
      }
    | { kind: 'ignored' };

export interface YCloudEchoStructure {
    eventKeys: string[];
    eventValueTypes: Record<string, string>;
    messageKeys: string[];
    messageValueTypes: Record<string, string>;
    maskedPhoneValues: Record<string, string>;
    status: string | null;
    messageType: string | null;
}

function asRecord(value: unknown): AnyRecord | null {
    return typeof value === 'object' && value !== null
        ? (value as AnyRecord)
        : null;
}

function stringField(record: AnyRecord | null, field: string): string | null {
    const value = record?.[field];
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function valueType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function maskPhone(value: string): string {
    const digits = value.replace(/\D/g, '');
    return digits.length <= 4
        ? '****'
        : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function getEchoStructure(
    root: AnyRecord | null,
    message: AnyRecord | null,
): YCloudEchoStructure {
    const eventKeys = root ? Object.keys(root) : [];
    const messageKeys = message ? Object.keys(message) : [];
    const eventValueTypes: Record<string, string> = {};
    const messageValueTypes: Record<string, string> = {};
    const maskedPhoneValues: Record<string, string> = {};

    for (const [key, value] of Object.entries(root ?? {})) {
        eventValueTypes[key] = valueType(value);
        if (
            typeof value === 'string' &&
            /(phone|telefone|from|to|recipient|destinat)/i.test(key)
        ) {
            maskedPhoneValues[`event.${key}`] = maskPhone(value);
        }
    }
    for (const [key, value] of Object.entries(message ?? {})) {
        messageValueTypes[key] = valueType(value);
        if (
            typeof value === 'string' &&
            /(phone|telefone|from|to|recipient|destinat)/i.test(key)
        ) {
            maskedPhoneValues[`whatsappMessage.${key}`] =
                maskPhone(value);
        }
    }

    return {
        eventKeys,
        eventValueTypes,
        messageKeys,
        messageValueTypes,
        maskedPhoneValues,
        status: stringField(message, 'status'),
        messageType: stringField(message, 'type'),
    };
}

function parseDateField(record: AnyRecord | null, field: string): Date | null {
    const value = stringField(record, field);
    if (!value) {
        return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
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
            asRecord(root?.whatsappMessage) ??
            asRecord(root?.whatsappSMBMessage) ??
            asRecord(root?.data) ??
            root;

        return {
            kind: 'echo',
            messageId:
                stringField(eventPayload, 'wamid') ??
                stringField(eventPayload, 'id'),
            phone: (() => {
                const to = stringField(eventPayload, 'to');
                return to ? canonicalizeYCloudPhone(to) : null;
            })(),
            sendTime: parseDateField(eventPayload, 'sendTime'),
            messageType: stringField(eventPayload, 'type'),
            structure: getEchoStructure(root, eventPayload),
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
    const textBody =
        messageType === 'text' ? stringField(textRecord, 'body') : null;
    const kind =
        messageType === 'text' && textBody !== null
            ? 'text'
            : messageType !== null &&
                YCLOUD_NON_TEXT_TYPES.includes(
                    messageType as (typeof YCLOUD_NON_TEXT_TYPES)[number],
                )
              ? 'non_text'
              : 'unknown';
    const unsupportedRecord = asRecord(payload.unsupported);
    const rawSubtype =
        messageType === 'unsupported'
            ? stringField(unsupportedRecord, 'type')
            : null;
    const from = stringField(payload, 'from');

    return {
        kind: 'message',
        message: {
            provider: 'ycloud',
            messageId:
                stringField(payload, 'wamid') ?? stringField(payload, 'id'),
            phone: from ? canonicalizeYCloudPhone(from) : null,
            alternateUserId: stringField(payload, 'fromUserId'),
            kind,
            rawType: messageType,
            rawSubtype,
            text: kind === 'text' ? textBody : null,
            isGroup: false,
            isFromMe: false,
        },
    };
}
