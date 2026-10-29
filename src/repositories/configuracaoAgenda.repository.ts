import { ConfiguracaoAgenda } from '@prisma/client';
import prisma from '../lib/prisma';
import type { ConfiguracaoHorizonteAgenda } from '../utils/horizonte-agenda';

function mapearConfiguracao(
    configuracao: ConfiguracaoAgenda | null,
): ConfiguracaoHorizonteAgenda {
    return {
        horizonteDias: configuracao?.horizonteDias ?? null,
        limiteAte: configuracao?.limiteAte?.toISOString().slice(0, 10) ?? null,
    };
}

export async function obter(): Promise<ConfiguracaoHorizonteAgenda> {
    const configuracao = await prisma.configuracaoAgenda.findUnique({
        where: { id: 1 },
    });
    return mapearConfiguracao(configuracao);
}

export async function definir(
    configuracao: ConfiguracaoHorizonteAgenda,
): Promise<ConfiguracaoHorizonteAgenda> {
    const limiteAte = configuracao.limiteAte
        ? new Date(`${configuracao.limiteAte}T00:00:00.000Z`)
        : null;
    const salvo = await prisma.configuracaoAgenda.upsert({
        where: { id: 1 },
        create: {
            id: 1,
            horizonteDias: configuracao.horizonteDias,
            limiteAte,
        },
        update: {
            horizonteDias: configuracao.horizonteDias,
            limiteAte,
        },
    });
    return mapearConfiguracao(salvo);
}
