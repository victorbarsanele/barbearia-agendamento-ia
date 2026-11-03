export type CelulaCsv = string | number | null;

export function escaparCelulaCsv(valor: CelulaCsv): string {
    const texto = valor === null ? '' : String(valor);
    if (/[;"\r\n]/.test(texto)) {
        return `"${texto.replaceAll('"', '""')}"`;
    }
    return texto;
}

export function neutralizarFormulaCsv(valor: string): string {
    return /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
}

export function serializarCsv(linhas: CelulaCsv[][]): string {
    return `\uFEFF${linhas
        .map((linha) => linha.map(escaparCelulaCsv).join(';'))
        .join('\r\n')}`;
}
