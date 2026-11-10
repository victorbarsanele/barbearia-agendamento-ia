import { formatarDataRelatorio } from './relatorios.js';

export function formatarLinhaRenovacao(
    renovadoEm: string | null | undefined,
): string | null {
    if (!renovadoEm) return null;
    return `Renovado automaticamente em ${formatarDataRelatorio(renovadoEm)}`;
}

export function obterRotuloSeloRenovacao(
    renovadoEm: string | null | undefined,
): string | null {
    return renovadoEm ? 'Renovado automaticamente' : null;
}
