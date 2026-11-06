import {
    inserirNonoDigitoTelefoneWhatsApp,
    normalizarTelefone,
} from '../utils/telefone';
import { IncomingWhatsAppMessage } from './types';
import { resolverAcaoBotaoLembrete } from './ycloud-lembrete';
import { resolverAcaoBotaoReativacao } from './ycloud-reativacao';

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
    | YCloudMessageStatusEvent
    | {
          kind: 'echo';
          messageId: string | null;
          phone: string | null;
          sendTime: Date | null;
          messageType: string | null;
          structure: YCloudEchoStructure;
      }
    | { kind: 'ignored' };

export interface YCloudMessageStatusEvent {
    kind: 'status';
    id: string | null;
    wamid: string | null;
    status: string | null;
    errorCode: string | null;
    errorMessage: string | null;
}

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

function stringOrNumberField(
    record: AnyRecord | null,
    field: string,
): string | null {
    const value = record?.[field];
    return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : null;
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
            maskedPhoneValues[`whatsappMessage.${key}`] = maskPhone(value);
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

    return inserirNonoDigitoTelefoneWhatsApp(digits) || null;
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

    if (eventType === 'whatsapp.message.updated') {
        const payload = asRecord(root?.whatsappMessage);
        return {
            kind: 'status',
            id: stringField(payload, 'id'),
            wamid: stringField(payload, 'wamid'),
            status: stringField(payload, 'status'),
            errorCode: stringOrNumberField(payload, 'errorCode'),
            errorMessage: stringField(payload, 'errorMessage'),
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
    const buttonRecord =
        messageType === 'button' ? asRecord(payload.button) : null;
    const contextRecord = asRecord(payload.context);
    const buttonPayload = stringField(buttonRecord, 'payload');
    const buttonText = stringField(buttonRecord, 'text');
    const buttonAction =
        resolverAcaoBotaoLembrete(buttonPayload) ??
        resolverAcaoBotaoReativacao(buttonPayload, buttonText);
    const textBody =
        messageType === 'text' ? stringField(textRecord, 'body') : null;
    const kind =
        messageType === 'text' && textBody !== null
            ? 'text'
            : messageType === 'button'
              ? buttonAction === null
                  ? 'unknown'
                  : 'button_reply'
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
    const audioRecord =
        messageType === 'audio' ? asRecord(payload.audio) : null;
    const media =
        messageType === 'audio'
            ? {
                  link: stringField(audioRecord, 'link'),
                  id: stringField(audioRecord, 'id'),
                  sha256: stringField(audioRecord, 'sha256'),
                  mimeType: stringField(audioRecord, 'mime_type'),
              }
            : null;

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
            buttonReply:
                messageType === 'button'
                    ? {
                          payload: buttonPayload,
                          text: buttonText,
                          contextId: stringField(contextRecord, 'id'),
                          action: buttonAction,
                      }
                    : null,
            media,
            isGroup: false,
            isFromMe: false,
        },
    };
}
