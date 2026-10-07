import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getWhatsAppProvider,
    validateWhatsAppConfiguration,
} from './config';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('WhatsApp configuration', () => {
    it('defaults to Evolution and requires no YCloud configuration', () => {
        vi.stubEnv('WHATSAPP_PROVIDER', '');
        vi.stubEnv('YCLOUD_API_KEY', '');
        vi.stubEnv('YCLOUD_WEBHOOK_SECRET', '');
        vi.stubEnv('YCLOUD_FROM_NUMBER', '');
        vi.stubEnv('BARBER_PHONE', '');

        expect(getWhatsAppProvider()).toBe('evolution');
        expect(validateWhatsAppConfiguration()).toBeUndefined();
    });

    it('rejects invalid provider with permitted options in the error', () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'other');
        expect(() => validateWhatsAppConfiguration()).toThrow(
            'WHATSAPP_PROVIDER inválido; valores permitidos: evolution, ycloud.',
        );
    });

    it('requires all YCloud values without exposing their contents', () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
        vi.stubEnv('YCLOUD_API_KEY', '');
        vi.stubEnv('YCLOUD_WEBHOOK_SECRET', '');
        vi.stubEnv('YCLOUD_FROM_NUMBER', '');
        vi.stubEnv('BARBER_PHONE', '');

        expect(() => validateWhatsAppConfiguration()).toThrow(
            'Configuração YCloud incompleta; variáveis obrigatórias: YCLOUD_API_KEY, YCLOUD_WEBHOOK_SECRET, YCLOUD_FROM_NUMBER, BARBER_PHONE.',
        );
    });

    it('rejects barber number matching the connected number after normalization', () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');
        vi.stubEnv('YCLOUD_WEBHOOK_SECRET', 'test-secret');
        vi.stubEnv('YCLOUD_FROM_NUMBER', '+5511999999999');
        vi.stubEnv('BARBER_PHONE', '11999999999');

        expect(() => validateWhatsAppConfiguration()).toThrow(
            'BARBER_PHONE não pode ser igual a YCLOUD_FROM_NUMBER.',
        );
    });

    it('accepts complete YCloud configuration with distinct numbers', () => {
        vi.stubEnv('WHATSAPP_PROVIDER', 'ycloud');
        vi.stubEnv('YCLOUD_API_KEY', 'test-key');
        vi.stubEnv('YCLOUD_WEBHOOK_SECRET', 'test-secret');
        vi.stubEnv('YCLOUD_FROM_NUMBER', '+5511888888888');
        vi.stubEnv('BARBER_PHONE', '5511999999999');

        expect(validateWhatsAppConfiguration()).toBeUndefined();
    });
});
