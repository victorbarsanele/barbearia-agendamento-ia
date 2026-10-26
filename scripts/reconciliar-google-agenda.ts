import { getGoogleCalendarConfig } from '../src/google-calendar/config';
import { GoogleCalendarAdapter } from '../src/google-calendar/google-calendar.adapter';
import { reconciliarGoogleAgenda } from '../src/google-calendar/sync.service';
import prisma from '../src/lib/prisma';

async function main(): Promise<void> {
    const config = getGoogleCalendarConfig();
    if (!config.enabled) {
        console.error(
            'Sincronização Google Agenda está desabilitada ou sem credenciais válidas.',
        );
        process.exitCode = 1;
        return;
    }

    try {
        const adapter = new GoogleCalendarAdapter(config);
        const ids = await reconciliarGoogleAgenda(adapter);
        console.info(
            `Reconciliação concluída. Itens enfileirados: ${ids.length}.`,
        );
    } finally {
        await prisma.$disconnect();
    }
}

void main().catch(() => {
    console.error('Falha na reconciliação Google Agenda.');
    process.exitCode = 1;
});
