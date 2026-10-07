import { normalizarTelefone } from '../utils/telefone';

export type WhatsAppProvider = 'evolution' | 'ycloud';

export function getWhatsAppProvider(): WhatsAppProvider {
    const provider = process.env.WHATSAPP_PROVIDER || 'evolution';

    if (provider !== 'evolution' && provider !== 'ycloud') {
        throw new Error(
            'WHATSAPP_PROVIDER inválido; valores permitidos: evolution, ycloud.',
        );
    }

    return provider;
}

export function validateWhatsAppConfiguration(): void {
    const provider = getWhatsAppProvider();

    if (provider === 'evolution') {
        return;
    }

    const requiredVariables = [
        'YCLOUD_API_KEY',
        'YCLOUD_WEBHOOK_SECRET',
        'YCLOUD_FROM_NUMBER',
        'BARBER_PHONE',
    ] as const;
    const missingVariables = requiredVariables.filter(
        (name) => !process.env[name]?.trim(),
    );

    if (missingVariables.length > 0) {
        throw new Error(
            `Configuração YCloud incompleta; variáveis obrigatórias: ${missingVariables.join(', ')}.`,
        );
    }

    const fromNumber = process.env.YCLOUD_FROM_NUMBER?.trim() ?? '';
    if (!/^\+\d{8,15}$/.test(fromNumber)) {
        throw new Error('YCLOUD_FROM_NUMBER deve estar em formato E.164.');
    }

    const normalizedFromNumber = normalizarTelefone(fromNumber);
    const normalizedBarberPhone = normalizarTelefone(
        process.env.BARBER_PHONE?.trim() ?? '',
    );

    if (normalizedBarberPhone === normalizedFromNumber) {
        throw new Error(
            'BARBER_PHONE não pode ser igual a YCLOUD_FROM_NUMBER.',
        );
    }
}

export function getYCloudFromNumber(): string {
    const number = process.env.YCLOUD_FROM_NUMBER?.trim();
    if (!number) {
        throw new Error('YCLOUD_FROM_NUMBER não configurado.');
    }

    return number;
}
