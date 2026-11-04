import { neutralizarFormulaCsv } from './csv.js';

export function obterTelefoneWhatsApp(telefone: string): string | null {
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length === 10 || digitos.length === 11) {
        return `55${digitos}`;
    }
    if (
        (digitos.length === 12 || digitos.length === 13) &&
        digitos.startsWith('55')
    ) {
        return digitos;
    }
    return null;
}

export function formatarTelefoneCsv(telefone: string): string {
    const digitos = telefone.replace(/\D/g, '');
    const nacional =
        (digitos.length === 12 || digitos.length === 13) &&
        digitos.startsWith('55')
            ? digitos.slice(2)
            : digitos;

    if (nacional.length === 10 || nacional.length === 11) {
        const ddd = nacional.slice(0, 2);
        const numero = nacional.slice(2);
        return nacional.length === 11
            ? `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`
            : `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
    }

    return neutralizarFormulaCsv(telefone);
}
