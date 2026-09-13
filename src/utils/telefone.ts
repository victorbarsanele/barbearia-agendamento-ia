export function normalizarTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');

    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }

    return digits;
}
