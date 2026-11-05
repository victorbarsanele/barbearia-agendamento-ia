import { StatusReativacaoEnvio } from '@prisma/client';
import { REATIVACAO_COOLDOWN_DIAS } from '../config/reativacao';

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export interface TentativaReativacaoCooldown {
    status: StatusReativacaoEnvio;
    criadoEm: Date;
}

export function calcularFimCooldown(
    tentativa: TentativaReativacaoCooldown | null,
): Date | null {
    if (!tentativa || tentativa.status === StatusReativacaoEnvio.FALHOU) {
        return null;
    }

    return new Date(
        tentativa.criadoEm.getTime() +
            REATIVACAO_COOLDOWN_DIAS * MILISSEGUNDOS_POR_DIA,
    );
}

export function estaEmCooldown(
    tentativa: TentativaReativacaoCooldown | null,
    agora = new Date(),
): boolean {
    const fimCooldown = calcularFimCooldown(tentativa);
    return fimCooldown !== null && agora < fimCooldown;
}
