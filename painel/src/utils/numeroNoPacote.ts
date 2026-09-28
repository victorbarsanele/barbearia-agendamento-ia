export function formatarNumeroNoPacote(
    numero: number | null | undefined,
    total: number | null | undefined,
): string | null {
    if (numero === null || numero === undefined || total === null || total === undefined) {
        return null;
    }

    return `${numero}º de ${total}`;
}