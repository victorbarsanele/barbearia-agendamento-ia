import { config } from 'dotenv';

config();

const [, , message, phone, secretArgument] = process.argv;

async function main(): Promise<void> {
    if (!message || !phone) {
        console.error(
            'Uso: npx tsx scripts/simular-webhook-whatsapp.ts "mensagem" numero [webhook-secret]',
        );
        process.exitCode = 1;
        return;
    }

    const port = process.env.PORT || '3333';
    const secret = secretArgument || process.env.WEBHOOK_SECRET;
    const remoteJid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

    const payload = {
        event: 'MESSAGES_UPSERT',
        instance: process.env.EVOLUTION_INSTANCE_NAME || 'barbearia',
        data: {
            key: {
                remoteJid,
                fromMe: false,
                id: `SIMULACAO-${Date.now()}`,
                addressingMode: 'pn',
            },
            pushName: 'Cliente simulacao',
            message: {
                conversation: message,
            },
            messageType: 'conversation',
        },
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (secret) {
        headers['x-webhook-secret'] = secret;
    }

    const response = await fetch(`http://localhost:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    console.log(`HTTP ${response.status}`);
    console.log(await response.text());
}

void main();
