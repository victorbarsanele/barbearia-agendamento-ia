function normalizarNome(nome: string): string {
    return nome
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
}

export function nomeConfereComConfirmacao(
    digitado: string,
    nome: string,
): boolean {
    return normalizarNome(digitado) === normalizarNome(nome);
}
