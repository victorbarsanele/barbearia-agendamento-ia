import { StatusReativacaoEnvio } from '@prisma/client';
import {
    REATIVACAO_COOLDOWN_DIAS,
    REATIVACAO_PENDENTE_EXPIRA_MS,
} from '../config/reativacao';

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export interface TentativaReativacaoCooldown {
    status: StatusReativacaoEnvio;
    criadoEm: Date;
}

export function normalizarTentativaReativacao(
    tentativa: TentativaReativacaoCooldown | null,
    agora = new Date(),
): TentativaReativacaoCooldown | null {
    if (
        tentativa?.status === StatusReativacaoEnvio.PENDENTE &&
        agora.getTime() - tentativa.criadoEm.getTime() >
            REATIVACAO_PENDENTE_EXPIRA_MS
    ) {
        return { ...tentativa, status: StatusReativacaoEnvio.FALHOU };
    }
    return tentativa;
}

export function calcularFimCooldown(
    tentativa: TentativaReativacaoCooldown | null,
    agora = new Date(),
): Date | null {
    const normalizada = normalizarTentativaReativacao(tentativa, agora);
    if (!normalizada || normalizada.status === StatusReativacaoEnvio.FALHOU) {
        return null;
    }

    return new Date(
        normalizada.criadoEm.getTime() +
            REATIVACAO_COOLDOWN_DIAS * MILISSEGUNDOS_POR_DIA,
    );
}

export function estaEmCooldown(
    tentativa: TentativaReativacaoCooldown | null,
    agora = new Date(),
): boolean {
    const fimCooldown = calcularFimCooldown(tentativa, agora);
    return fimCooldown !== null && agora < fimCooldown;
}
