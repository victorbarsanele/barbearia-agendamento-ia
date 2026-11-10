import { formatarDataRelatorio } from './relatorios.js';

export function formatarLinhaRenovacao(
    renovadoEm: string | null,
): string | null {
    if (renovadoEm === null) return null;
    return `Renovado automaticamente em ${formatarDataRelatorio(renovadoEm)}`;
}

export function obterRotuloSeloRenovacao(
    renovadoEm: string | null,
): string | null {
    return renovadoEm === null ? null : 'Renovado automaticamente';
}
