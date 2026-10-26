import { createHash, createPrivateKey } from 'node:crypto';

let ultimaConfiguracaoInvalidaLogada: string | undefined;

export interface GoogleCalendarConfig {
    enabled: boolean;
    calendarId?: string;
    serviceAccount?: {
        client_email: string;
        private_key: string;
    };
}

export function getGoogleCalendarConfig(
    logError: (message: string) => void = (message) =>
        console.error('[GOOGLE CALENDAR]', message),
): GoogleCalendarConfig {
    if (process.env.GOOGLE_CALENDAR_SYNC_ENABLED !== 'true') {
        return { enabled: false };
    }

    const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
    const calendarId = process.env.GOOGLE_CALENDAR_ID?.trim();
    if (!encoded || !calendarId) {
        registrarErroUmaVez(
            criarChaveConfig(`${encoded ?? ''}:${calendarId ?? ''}`),
            logError,
            'Sincronização desabilitada: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 e GOOGLE_CALENDAR_ID são obrigatórios.',
        );
        return { enabled: false };
    }

    try {
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
            throw new Error('base64 inválido');
        }
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        if (Buffer.from(decoded, 'utf8').toString('base64') !== encoded) {
            throw new Error('base64 inválido');
        }
        const parsed: unknown = JSON.parse(decoded);
        if (
            typeof parsed !== 'object' ||
            parsed === null ||
            !('client_email' in parsed) ||
            typeof parsed.client_email !== 'string' ||
            !('private_key' in parsed) ||
            typeof parsed.private_key !== 'string' ||
            !parsed.client_email.includes('@') ||
            !parsed.private_key.includes('PRIVATE KEY')
        ) {
            throw new Error('credencial inválida');
        }
        createPrivateKey(parsed.private_key);

        return {
            enabled: true,
            calendarId,
            serviceAccount: {
                client_email: parsed.client_email,
                private_key: parsed.private_key,
            },
        };
    } catch {
        registrarErroUmaVez(
            criarChaveConfig(`${encoded}:${calendarId}`),
            logError,
            'Sincronização desabilitada: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 não contém uma credencial válida.',
        );
        return { enabled: false };
    }
}

function registrarErroUmaVez(
    chave: string,
    logError: (message: string) => void,
    mensagem: string,
): void {
    if (ultimaConfiguracaoInvalidaLogada === chave) return;
    ultimaConfiguracaoInvalidaLogada = chave;
    logError(mensagem);
}

function criarChaveConfig(valor: string): string {
    return createHash('sha256').update(valor).digest('hex');
}
