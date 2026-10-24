export const FALLBACK_MIN_ANTECEDENCIA_MINUTOS = 60;

export function normalizarMinAntecedencia(valor: unknown): number {
    if (
        typeof valor === 'number' &&
        Number.isFinite(valor) &&
        Number.isInteger(valor) &&
        valor >= 0 &&
        valor <= 1440
    ) {
        return valor;
    }

    return FALLBACK_MIN_ANTECEDENCIA_MINUTOS;
}

export function calcularPisoAntecedencia(agora: number, minutos: number): Date {
    return new Date(agora + minutos * 60_000);
}
