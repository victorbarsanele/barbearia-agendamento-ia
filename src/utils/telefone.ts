export function normalizarTelefone(telefone: string): string {
    const digits = telefone.replace(/\D/g, '');

    if (digits.length === 10 || digits.length === 11) {
        return `55${digits}`;
    }

    return digits;
}

export function inserirNonoDigitoTelefoneWhatsApp(telefone: string): string {
    if (
        telefone.length === 12 &&
        telefone.startsWith('55') &&
        /^[6-9]/.test(telefone[4] ?? '')
    ) {
        return `${telefone.slice(0, 4)}9${telefone.slice(4)}`;
    }

    return telefone;
}

export function canonicalizarTelefoneWhatsApp(raw: string): string {
    return inserirNonoDigitoTelefoneWhatsApp(normalizarTelefone(raw));
}

export function variantesTelefoneWhatsApp(canonico: string): string[] {
    if (
        canonico.length === 13 &&
        canonico.startsWith('55') &&
        canonico[4] === '9'
    ) {
        return [canonico, `${canonico.slice(0, 4)}${canonico.slice(5)}`];
    }

    return [canonico];
}

export function validarTelefoneCelularBrasileiro(telefone: string): boolean {
    const digits = telefone.replace(/\D/g, '');
    const nacional =
        digits.length === 13 && digits.startsWith('55')
            ? digits.slice(2)
            : digits;

    return nacional.length === 11 && /^[1-9]\d9\d{8}$/.test(nacional);
}
