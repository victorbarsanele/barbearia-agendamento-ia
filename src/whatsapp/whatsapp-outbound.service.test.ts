import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getWhatsAppProvider: vi.fn(),
    sendEvolutionText: vi.fn(),
    sendYCloudText: vi.fn(),
}));

vi.mock('./config', () => ({
    getWhatsAppProvider: mocks.getWhatsAppProvider,
}));
vi.mock('./evolution-outbound.adapter', () => ({
    sendWhatsAppText: mocks.sendEvolutionText,
}));
vi.mock('./ycloud-outbound.adapter', () => ({
    sendYCloudText: mocks.sendYCloudText,
}));

import { sendWhatsAppText } from './whatsapp-outbound.service';

const firstId = 'c123456789012345678901234';
const secondId = 'c223456789012345678901234';
const recipient = '5511999999999';

beforeEach(() => {
    vi.resetAllMocks();
    mocks.getWhatsAppProvider.mockReturnValue('ycloud');
    mocks.sendEvolutionText.mockResolvedValue(undefined);
    mocks.sendYCloudText.mockResolvedValue(undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('sendWhatsAppText', () => {
    it.each([
        ['ycloud', 'sendYCloudText'],
        ['evolution', 'sendEvolutionText'],
    ])('envia texto sanitizado para %s', async (provider, adapter) => {
        mocks.getWhatsAppProvider.mockReturnValue(provider);
        const text = `Corte (${firstId}) e Barba (${secondId})`;

        await sendWhatsAppText(recipient, text);

        if (adapter === 'sendYCloudText') {
            expect(mocks.sendYCloudText).toHaveBeenCalledWith(
                recipient,
                'Corte e Barba',
            );
            expect(mocks.sendEvolutionText).not.toHaveBeenCalled();
        } else {
            expect(mocks.sendEvolutionText).toHaveBeenCalledWith(
                recipient,
                'Corte e Barba',
            );
            expect(mocks.sendYCloudText).not.toHaveBeenCalled();
        }
    });

    it('usa frase neutra quando sanitização deixa texto vazio', async () => {
        await sendWhatsAppText(recipient, `  ${firstId}  `);

        expect(mocks.sendYCloudText).toHaveBeenCalledWith(
            recipient,
            'Desculpe, não consegui responder agora. Pode repetir, por favor?',
        );
    });

    it('loga somente quantidade removida, sem texto, destinatário ou IDs', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const text = `Conteúdo privado (${firstId}) e (${secondId})`;

        await sendWhatsAppText(recipient, text);

        expect(info).toHaveBeenCalledTimes(1);
        expect(info).toHaveBeenCalledWith('[WHATSAPP] IDs internos removidos', {
            quantidade: 2,
        });
        const serializedLog = JSON.stringify(info.mock.calls);
        expect(serializedLog).not.toContain(text);
        expect(serializedLog).not.toContain(recipient);
        expect(serializedLog).not.toContain(firstId);
        expect(serializedLog).not.toContain(secondId);
    });
});
