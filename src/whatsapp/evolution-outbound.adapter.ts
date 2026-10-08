import { normalizarTelefone } from '../utils/telefone';
import { getWhatsAppProvider } from './config';

function getEvolutionApiKey(): string | undefined {
    return process.env.EVOLUTION_API_KEY;
}

function getEvolutionApiUrl(): string {
    return process.env.EVOLUTION_API_URL || 'http://localhost:8080';
}

function getEvolutionInstanceName(): string {
    return process.env.EVOLUTION_INSTANCE_NAME || 'barbearia';
}

function getEvolutionSendTextUrl(): string {
    return `${getEvolutionApiUrl()}/message/sendText/${getEvolutionInstanceName()}`;
}

function mascararTelefone(phone: string): string {
    return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export async function sendWhatsAppText(
    remoteJid: string,
    text: string,
): Promise<void> {
    if (getWhatsAppProvider() !== 'evolution') {
        throw new Error(
            'Evolution outbound adapter não pode ser usado com outro provedor.',
        );
    }

    const number = normalizarTelefone(remoteJid);

    if (!number) {
        return;
    }

    if (process.env.SIMULACAO_WEBHOOK === 'true') {
        if (process.env.NODE_ENV === 'production') {
            console.warn(
                '[GEMINI SERVICE] SIMULACAO_WEBHOOK ignorada em produção.',
            );
        } else {
            console.log(
                '\n=== [SIMULACAO WEBHOOK] Mensagem que seria enviada ===',
            );
            console.log(`Para: ${mascararTelefone(number)}`);
            console.log('Texto suprimido por privacidade.');
            console.log(
                '=======================================================\n',
            );
            return;
        }
    }

    const evolutionApiKey = getEvolutionApiKey();

    if (!evolutionApiKey) {
        throw new Error('EVOLUTION_API_KEY não definido no ambiente.');
    }

    const url = getEvolutionSendTextUrl();

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: evolutionApiKey,
            },
            body: JSON.stringify({
                number,
                text,
            }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(
                `Falha ao enviar mensagem pela Evolution API (${response.status}): ${body}`,
            );
        }
    } catch (error) {
        console.error('[EVOLUTION ADAPTER] Falha ao enviar mensagem.');
        throw error;
    }
}
