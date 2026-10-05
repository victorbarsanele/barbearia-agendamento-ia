import { normalizarTelefone } from '../utils/telefone';
import { IncomingWhatsAppMessage } from './types';

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    return value as AnyRecord;
}

function readString(record: AnyRecord | null, key: string): string | null {
    if (!record) {
        return null;
    }

    const value = record[key];
    return typeof value === 'string' ? value : null;
}

function readBoolean(record: AnyRecord | null, key: string): boolean | null {
    if (!record) {
        return null;
    }

    const value = record[key];
    return typeof value === 'boolean' ? value : null;
}

export function parseEvolutionIncomingMessage(
    body: unknown,
): IncomingWhatsAppMessage {
    const root = asRecord(body);
    const data = asRecord(root?.data);
    const key = asRecord(data?.key ?? root?.key);
    const message = asRecord(data?.message ?? root?.message);

    const remoteJidRaw = readString(key, 'remoteJid');
    const remoteJidAlt = readString(key, 'remoteJidAlt');
    const addressingMode = readString(key, 'addressingMode');
    const remoteJid =
        addressingMode === 'lid' && remoteJidAlt ? remoteJidAlt : remoteJidRaw;
    const normalizedPhone = remoteJid ? normalizarTelefone(remoteJid) : '';

    return {
        provider: 'evolution',
        messageId: readString(key, 'id'),
        phone: normalizedPhone || null,
        alternateUserId: null,
        text: readString(message, 'conversation'),
        isGroup: remoteJid?.endsWith('@g.us') ?? false,
        isFromMe: readBoolean(key, 'fromMe') ?? false,
    };
}
