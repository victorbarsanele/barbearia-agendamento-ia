import { enviarNotificacaoWhatsApp } from './whatsapp-notification.service';

const notifiedUsers = new Map<string, number>();

function cooldownMs(): number {
    const configured = Number(process.env.ESCALATION_COOLDOWN_MS ?? 15 * 60 * 1000);
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : 15 * 60 * 1000;
}

export async function avisarBarbeiroUsuarioSemTelefone(
    userId: string,
): Promise<void> {
    const now = Date.now();
    const lastNotified = notifiedUsers.get(userId);
    const cooldown = cooldownMs();

    if (lastNotified !== undefined && now - lastNotified < cooldown) {
        return;
    }

    notifiedUsers.set(userId, now);
    const barberPhone = process.env.BARBER_PHONE?.trim();
    if (!barberPhone) {
        console.warn(
            '[YCLOUD WEBHOOK] BARBER_PHONE ausente; aviso de remetente sem telefone não enviado.',
        );
        return;
    }

    try {
        await enviarNotificacaoWhatsApp('atendimento_humano', barberPhone, {
            telefoneCliente: 'sem telefone visível (username)',
            motivo: 'cliente sem número visível; responda pelo app',
        });
    } catch {
        console.error(
            '[YCLOUD WEBHOOK] Falha ao notificar barbeiro sobre remetente sem telefone.',
        );
    }
}

export function resetAvisosUsuarioSemTelefone(): void {
    notifiedUsers.clear();
}
