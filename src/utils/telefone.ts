export function normalizarTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');

    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }

    return digits;
}

export function validarTelefoneCelularBrasileiro(
    telefone: string,
): boolean {
    const digits = telefone.replace(/\D/g, '');
    const nacional =
        digits.length === 13 && digits.startsWith('55')
            ? digits.slice(2)
            : digits;

    return (
        nacional.length === 11 &&
        /^[1-9]\d9\d{8}$/.test(nacional)
    );
}
