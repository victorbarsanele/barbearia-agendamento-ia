import { canonicalizeYCloudPhone } from './ycloud-inbound.adapter';

export interface WhatsAppAllowlist {
    active: boolean;
    phones: ReadonlySet<string>;
}

const PHONE_DIGITS_PATTERN = /^\d{8,15}$/;

export function getWhatsAppAllowlist(): WhatsAppAllowlist {
    const configured = process.env.WHATSAPP_ALLOWLIST;

    if (configured === undefined || configured.trim() === '') {
        return { active: false, phones: new Set() };
    }

    const phones = new Set(
        configured
            .split(',')
            .map((entry) => canonicalizeYCloudPhone(entry.trim()))
            .filter(
                (phone): phone is string =>
                    phone !== null && PHONE_DIGITS_PATTERN.test(phone),
            ),
    );

    if (phones.size === 0) {
        throw new Error(
            'WHATSAPP_ALLOWLIST contém conteúdo, mas nenhuma entrada válida.',
        );
    }

    return { active: true, phones };
}

export function validateWhatsAppAllowlist(): void {
    const allowlist = getWhatsAppAllowlist();

    if (allowlist.active) {
        console.info(
            `[WHATSAPP] Lista de teste ativa; números: ${allowlist.phones.size}.`,
        );
    }
}
