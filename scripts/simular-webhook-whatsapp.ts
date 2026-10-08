import { config } from 'dotenv';
import { createYCloudSignature } from '../src/whatsapp/ycloud-signature';

config();

const [, , ...arguments_] = process.argv;

async function simulateYCloud(): Promise<void> {
    const [, eventKind, ...args] = arguments_;
    const secret = process.env.YCLOUD_WEBHOOK_SECRET;

    if (!secret) {
        console.error('YCLOUD_WEBHOOK_SECRET não configurado.');
        process.exitCode = 1;
        return;
    }

    let payload: Record<string, unknown>;
    if (eventKind === 'echo') {
        const wamid = args[0] || `SIMULACAO-${Date.now()}`;
        payload = {
            type: 'whatsapp.smb.message.echoes',
            whatsappSMBMessage: { wamid },
        };
    } else if (eventKind === 'username') {
        const [fromUserId, message] = args;
        if (!fromUserId || !message) {
            console.error(
                'Uso: npx tsx scripts/simular-webhook-whatsapp.ts --ycloud username user-id "mensagem"',
            );
            process.exitCode = 1;
            return;
        }
        payload = {
            type: 'whatsapp.inbound_message.received',
            whatsappInboundMessage: {
                wamid: `SIMULACAO-${Date.now()}`,
                fromUserId,
                type: 'text',
                text: { body: message },
            },
        };
    } else if (eventKind === 'text') {
        const [phone, message] = args;
        if (!phone || !message) {
            console.error(
                'Uso: npx tsx scripts/simular-webhook-whatsapp.ts --ycloud text "+5511999999999" "mensagem"',
            );
            process.exitCode = 1;
            return;
        }
        payload = {
            type: 'whatsapp.inbound_message.received',
            whatsappInboundMessage: {
                wamid: `SIMULACAO-${Date.now()}`,
                from: phone,
                type: 'text',
                text: { body: message },
            },
        };
    } else {
        console.error(
            'Uso: npx tsx scripts/simular-webhook-whatsapp.ts --ycloud text|echo|username ...',
        );
        process.exitCode = 1;
        return;
    }

    const rawBody = JSON.stringify(payload);
    const port = process.env.PORT || '3333';
    const response = await fetch(`http://localhost:${port}/webhook/ycloud`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'YCloud-Signature': createYCloudSignature(rawBody, secret),
        },
        body: rawBody,
    });

    console.log(`HTTP ${response.status}`);
    console.log(await response.text());
}

async function main(): Promise<void> {
    if (arguments_[0] === '--ycloud') {
        await simulateYCloud();
        return;
    }

    const [message, phone, secretArgument] = arguments_;
    if (!message || !phone) {
        console.error(
            'Uso Evolution: npx tsx scripts/simular-webhook-whatsapp.ts "mensagem" numero [webhook-secret]',
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
