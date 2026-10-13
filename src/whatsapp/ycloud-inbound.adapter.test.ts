import { describe, expect, it } from 'vitest';
import {
    canonicalizeYCloudPhone,
    parseYCloudWebhookEvent,
} from './ycloud-inbound.adapter';

describe('YCloud inbound adapter', () => {
    it('parses inbound text and canonicalizes phone with or without plus', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: 'wamid-1',
                    from: '+5511999999999',
                    type: 'text',
                    text: { body: 'Olá' },
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: {
                provider: 'ycloud',
                messageId: 'wamid-1',
                phone: '5511999999999',
                kind: 'text',
                rawType: 'text',
                text: 'Olá',
                isGroup: false,
                isFromMe: false,
            },
        });
        expect(canonicalizeYCloudPhone('5511999999999')).toBe('5511999999999');
        expect(canonicalizeYCloudPhone('+19999999999')).toBe('5519999999999');
    });

    it('falls back from wamid to id and leaves non-text messages without text', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    id: 'fallback-id',
                    from: '5511999999999',
                    type: 'image',
                    image: {},
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: {
                messageId: 'fallback-id',
                kind: 'non_text',
                rawType: 'image',
                text: null,
            },
        });
    });

    it.each([
        'image',
        'video',
        'audio',
        'document',
        'sticker',
        'location',
        'contacts',
        'contact',
    ])('classifies YCloud %s as non-text', (type) => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: `wamid-${type}`,
                    from: '5511999999999',
                    type,
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: {
                kind: 'non_text',
                rawType: type,
                text: null,
            },
        });
    });

    it.each([
        'reaction',
        'button',
        'interactive',
        'order',
        'system',
        'request_welcome',
        'future_type',
    ])('classifies YCloud %s as unknown', (type) => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: `wamid-${type}`,
                    from: '5511999999999',
                    type,
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: { kind: 'unknown', rawType: type, text: null },
        });
    });

    it('preserves unsupported subtype while classifying as unknown', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: 'wamid-unsupported',
                    from: '5511999999999',
                    type: 'unsupported',
                    unsupported: { type: 'poll_update' },
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: {
                kind: 'unknown',
                rawType: 'unsupported',
                rawSubtype: 'poll_update',
            },
        });
    });

    it('classifies text without valid body as unknown', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: 'wamid-empty-text',
                    from: '5511999999999',
                    type: 'text',
                    text: {},
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: { kind: 'unknown', rawType: 'text', text: null },
        });
    });

    it('classifies missing YCloud type as unknown', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: 'wamid-unknown',
                    from: '5511999999999',
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: { kind: 'unknown', rawType: null, text: null },
        });
    });

    it('keeps alternate user identifier when phone is absent', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.inbound_message.received',
                whatsappInboundMessage: {
                    wamid: 'wamid-2',
                    fromUserId: 'username-123',
                    type: 'text',
                    text: { body: 'Olá' },
                },
            }),
        ).toMatchObject({
            kind: 'message',
            message: {
                phone: null,
                alternateUserId: 'username-123',
                text: 'Olá',
            },
        });
    });

    it('inserts ninth digit for legacy mobile and preserves landline and 13 digits', () => {
        expect(canonicalizeYCloudPhone('551198765432')).toBe('5511998765432');
        expect(canonicalizeYCloudPhone('551123456789')).toBe('551123456789');
        expect(canonicalizeYCloudPhone('5511998765432')).toBe('5511998765432');
    });

    it('parses echoes and ignores unknown event types', () => {
        expect(
            parseYCloudWebhookEvent({
                id: 'event-1',
                type: 'whatsapp.smb.message.echoes',
                apiVersion: 'v1',
                createTime: '2026-10-12T21:00:00.000Z',
                whatsappMessage: {
                    id: 'echo-id',
                    wamid: 'wamid-echo-id',
                    status: 'sent',
                    from: '+5511888888888',
                    to: '+5511999999999',
                    type: 'text',
                    text: { body: 'conteúdo não deve ser logado' },
                    sendTime: '2026-10-12T21:00:01.000Z',
                    toUserId: 'username-ignored',
                },
            }),
        ).toMatchObject({
            kind: 'echo',
            messageId: 'wamid-echo-id',
            phone: '5511999999999',
            sendTime: new Date('2026-10-12T21:00:01.000Z'),
            messageType: 'text',
        });
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.smb.message.echoes',
                whatsappSMBMessage: {
                    id: 'fallback-id',
                    to: '5511999999999',
                    type: 'text',
                    sendTime: '2026-10-12T21:00:00.000Z',
                },
            }),
        ).toMatchObject({
            kind: 'echo',
            messageId: 'fallback-id',
            phone: '5511999999999',
        });
        expect(
            parseYCloudWebhookEvent({ type: 'whatsapp.message.updated' }),
        ).toEqual({ kind: 'ignored' });
    });

    it('keeps echo without recipient as a no-op payload', () => {
        expect(
            parseYCloudWebhookEvent({
                type: 'whatsapp.smb.message.echoes',
                whatsappMessage: {
                    wamid: 'without-to',
                    toUserId: 'username-only',
                    type: 'text',
                },
            }),
        ).toMatchObject({
            kind: 'echo',
            messageId: 'without-to',
            phone: null,
            sendTime: null,
        });
    });
});
