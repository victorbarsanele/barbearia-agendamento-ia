import { normalizarTelefone } from '../utils/telefone';
import { getWhatsAppProvider } from './config';
import { sendWhatsAppText as sendEvolutionText } from './evolution-outbound.adapter';
import { sendYCloudText } from './ycloud-outbound.adapter';

export async function sendWhatsAppText(
    recipient: string,
    text: string,
): Promise<void> {
    if (getWhatsAppProvider() === 'evolution') {
        await sendEvolutionText(recipient, text);
        return;
    }

    const phone = normalizarTelefone(recipient);
    if (!phone) {
        return;
    }
    if (process.env.SIMULACAO_WEBHOOK === 'true') {
        console.log(
            `[SIMULACAO WEBHOOK] Destinatário: ${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`,
        );
        return;
    }

    await sendYCloudText(phone, text);
}
