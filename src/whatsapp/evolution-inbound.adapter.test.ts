import { describe, expect, it } from 'vitest';
import { parseEvolutionIncomingMessage } from './evolution-inbound.adapter';

describe('parseEvolutionIncomingMessage', () => {
    it('lê ID, texto, remetente e indicadores da mensagem', () => {
        expect(
            parseEvolutionIncomingMessage({
                data: {
                    key: {
                        id: 'message-1',
                        remoteJid: '19999999999@s.whatsapp.net',
                        fromMe: false,
                    },
                    message: { conversation: 'Olá' },
                },
            }),
        ).toEqual({
            provider: 'evolution',
            messageId: 'message-1',
            phone: '5519999999999',
            alternateUserId: null,
            text: 'Olá',
            isGroup: false,
            isFromMe: false,
        });
    });

    it('identifica grupos e mensagens próprias', () => {
        expect(
            parseEvolutionIncomingMessage({
                data: {
                    key: {
                        id: 'message-2',
                        remoteJid: '120363123456789@g.us',
                        fromMe: true,
                    },
                },
            }),
        ).toMatchObject({
            messageId: 'message-2',
            isGroup: true,
            isFromMe: true,
        });
    });

    it('usa remoteJidAlt para addressingMode lid', () => {
        expect(
            parseEvolutionIncomingMessage({
                data: {
                    key: {
                        id: 'message-3',
                        remoteJid: '48220470251628@lid',
                        remoteJidAlt: '5519998374350@s.whatsapp.net',
                        addressingMode: 'lid',
                    },
                    message: { conversation: 'Olá' },
                },
            }),
        ).toMatchObject({
            phone: '5519998374350',
            alternateUserId: null,
        });
    });

    it('mantém fallback para remoteJid quando remoteJidAlt não existe', () => {
        expect(
            parseEvolutionIncomingMessage({
                data: {
                    key: {
                        id: 'message-4',
                        remoteJid: '48220470251628@lid',
                        addressingMode: 'lid',
                    },
                    message: { conversation: 'Olá' },
                },
            }),
        ).toMatchObject({ phone: '48220470251628' });
    });
});
