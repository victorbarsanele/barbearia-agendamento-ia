export function formatarTelefone(valor: string): string {
    const digits = valor.replace(/\D/g, '');

    if (digits.length === 13 && digits.startsWith('55')) {
        return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }

    if (digits.length === 12 && digits.startsWith('55')) {
        return `+55 ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }

    return valor;
}