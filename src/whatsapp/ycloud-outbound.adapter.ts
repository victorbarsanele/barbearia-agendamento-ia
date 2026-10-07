import { normalizarTelefone } from '../utils/telefone';
import { getYCloudFromNumber } from './config';

const YCLOUD_API_URL =
    'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly';
const REQUEST_TIMEOUT_MS = 15_000;

export interface YCloudTemplateParameter {
    type: 'text';
    text: string;
}

function asE164(value: string): string {
    const number = normalizarTelefone(value);
    if (!number) {
        throw new Error('Número de WhatsApp inválido.');
    }

    return `+${number}`;
}

function readProviderError(value: unknown): { code?: string; message?: string } {
    if (typeof value !== 'object' || value === null) {
        return {};
    }

    const record = value as Record<string, unknown>;
    const nested =
        typeof record.error === 'object' && record.error !== null
            ? (record.error as Record<string, unknown>)
            : record;
    const code =
        typeof nested.code === 'string' ? nested.code.slice(0, 100) : undefined;
    const message =
        typeof nested.message === 'string'
            ? nested.message.slice(0, 300)
            : undefined;

    return { code, message };
}

async function sendYCloudMessage(
    recipient: string,
    message: Record<string, unknown>,
): Promise<void> {
    const apiKey = process.env.YCLOUD_API_KEY;
    if (!apiKey) {
        throw new Error('YCLOUD_API_KEY não configurado.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(YCLOUD_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify({
                from: asE164(getYCloudFromNumber()),
                to: asE164(recipient),
                ...message,
            }),
            signal: controller.signal,
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => null);
            if (controller.signal.aborted) {
                throw new Error('Timeout no envio YCloud após 15000 ms.');
            }
            const providerError = readProviderError(errorBody);
            const details = [
                `HTTP ${response.status}`,
                providerError.code ? `código ${providerError.code}` : null,
                providerError.message ? `mensagem ${providerError.message}` : null,
            ]
                .filter(Boolean)
                .join('; ');

            throw new Error(`Falha no envio YCloud: ${details}.`);
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('Falha no envio YCloud:')) {
            throw error;
        }
        if (controller.signal.aborted) {
            throw new Error('Timeout no envio YCloud após 15000 ms.');
        }
        throw new Error('Falha de rede no envio YCloud.');
    } finally {
        clearTimeout(timeout);
    }
}

export function sendYCloudText(
    recipient: string,
    text: string,
): Promise<void> {
    return sendYCloudMessage(recipient, {
        type: 'text',
        text: { body: text, preview_url: false },
    });
}

export function sendYCloudTemplate(
    recipient: string,
    templateName: string,
    parameters: YCloudTemplateParameter[],
): Promise<void> {
    return sendYCloudMessage(recipient, {
        type: 'template',
        template: {
            name: templateName,
            language: { code: 'pt_BR' },
            components: [
                {
                    type: 'body',
                    parameters,
                },
            ],
        },
    });
}
