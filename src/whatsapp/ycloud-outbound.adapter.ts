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

function readProviderResponse(value: unknown): {
    id?: string;
    status?: string;
    code?: string;
    message?: string;
} {
    if (typeof value !== 'object' || value === null) {
        return {};
    }

    const record = value as Record<string, unknown>;
    const nested =
        typeof record.error === 'object' && record.error !== null
            ? (record.error as Record<string, unknown>)
            : record;
    const codeValue =
        nested.code ??
        nested.errorCode ??
        nested.error_code ??
        record.code ??
        record.errorCode ??
        record.error_code;
    const code =
        typeof codeValue === 'string' || typeof codeValue === 'number'
            ? String(codeValue).slice(0, 100)
            : undefined;
    const messageValue = nested.message ?? record.message;
    const sanitizedMessage =
        typeof messageValue === 'string'
            ? messageValue.slice(0, 300)
            : undefined;

    return {
        id: typeof record.id === 'string' ? record.id.slice(0, 100) : undefined,
        status:
            typeof record.status === 'string'
                ? record.status.slice(0, 50)
                : undefined,
        code,
        message: sanitizedMessage,
    };
}

function sanitizeProviderText(value: string): string {
    return value.replace(/\+?\d{8,}/g, '[número]');
}

function safeLogValue(value: string | undefined): string {
    return value
        ? sanitizeProviderText(value.replace(/[\r\n\t]/g, ' ').slice(0, 100))
        : 'ausente';
}

async function readJsonResponse(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

async function sendYCloudMessage(
    recipient: string,
    message: Record<string, unknown>,
): Promise<void> {
    const apiKey = process.env.YCLOUD_API_KEY;
    if (!apiKey) {
        throw new Error('YCLOUD_API_KEY não configurado.');
    }

    const requestBody = {
        from: asE164(getYCloudFromNumber()),
        to: asE164(recipient),
        ...message,
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(YCLOUD_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
        });

        if (!response.ok) {
            const providerError = readProviderResponse(
                await readJsonResponse(response),
            );
            if (controller.signal.aborted) {
                throw new Error('Timeout no envio YCloud após 15000 ms.');
            }
            const details = [
                `HTTP ${response.status}`,
                providerError.code
                    ? `código ${sanitizeProviderText(providerError.code)}`
                    : null,
                providerError.message
                    ? `mensagem ${sanitizeProviderText(providerError.message)}`
                    : null,
            ]
                .filter(Boolean)
                .join('; ');

            throw new Error(`Falha no envio YCloud: ${details}.`);
        }

        const providerResponse = readProviderResponse(
            await readJsonResponse(response),
        );
        if (controller.signal.aborted) {
            throw new Error('Timeout no envio YCloud após 15000 ms.');
        }
        if (
            providerResponse.status?.toLowerCase() === 'failed' ||
            providerResponse.code
        ) {
            const details = [
                providerResponse.status
                    ? `status ${sanitizeProviderText(providerResponse.status)}`
                    : null,
                providerResponse.code
                    ? `código ${sanitizeProviderText(providerResponse.code)}`
                    : null,
                providerResponse.message
                    ? `mensagem ${sanitizeProviderText(providerResponse.message)}`
                    : null,
            ]
                .filter(Boolean)
                .join('; ');
            throw new Error(`Falha no envio YCloud: ${details}.`);
        }

        console.info(
            `[YCLOUD] Envio aceito | id: ${safeLogValue(providerResponse.id)} | status: ${safeLogValue(providerResponse.status)}`,
        );
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
