import { normalizarTelefone } from '../utils/telefone';
import { removerIdsInternos } from '../utils/internal-id-filter';
import { getWhatsAppProvider } from './config';
import { sendWhatsAppText as sendEvolutionText } from './evolution-outbound.adapter';
import { sendYCloudText } from './ycloud-outbound.adapter';

const EMPTY_SANITIZED_MESSAGE =
    'Desculpe, não consegui responder agora. Pode repetir, por favor?';

export async function sendWhatsAppText(
    recipient: string,
    text: string,
): Promise<void> {
    const sanitized = removerIdsInternos(text);
    if (sanitized.count > 0) {
        console.info('[WHATSAPP] IDs internos removidos', {
            quantidade: sanitized.count,
        });
    }
    const outgoingText = sanitized.text.trim()
        ? sanitized.text
        : EMPTY_SANITIZED_MESSAGE;

    if (getWhatsAppProvider() === 'evolution') {
        await sendEvolutionText(recipient, outgoingText);
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

    await sendYCloudText(phone, outgoingText);
}
