import { Bot, Monitor } from 'lucide-react';

type OrigemAgendamento = 'PAINEL' | 'WHATSAPP_IA' | null | undefined;

export function infoOrigemAgendamento(origem: OrigemAgendamento) {
    if (origem === 'WHATSAPP_IA') {
        return { Icon: Bot, label: 'Agendado pelo WhatsApp (IA)' };
    }

    if (origem === 'PAINEL') {
        return { Icon: Monitor, label: 'Agendado pelo painel' };
    }

    return null;
}
