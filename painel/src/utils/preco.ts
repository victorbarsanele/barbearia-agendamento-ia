export function normalizePrecoInputBR(rawValue: string): string {
    const cleaned = rawValue
        .replace(/\s+/g, '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, ',')
        .replace(/-/g, '');

    const firstCommaIndex = cleaned.indexOf(',');

    if (firstCommaIndex === -1) {
        const integerPart = cleaned.replace(/,/g, '');
        return integerPart.replace(/^0+(?=\d)/, '');
    }

    const integerPartRaw = cleaned.slice(0, firstCommaIndex).replace(/,/g, '');
    const decimalPart = cleaned
        .slice(firstCommaIndex + 1)
        .replace(/,/g, '')
        .slice(0, 2);

    const integerPart = integerPartRaw.replace(/^0+(?=\d)/, '');

    return `${integerPart || '0'},${decimalPart}`;
}

export function parsePrecoInputBR(value: string): number | undefined {
    const trimmed = value.trim();

    if (!trimmed) {
        return undefined;
    }

    const numericText = trimmed.replace(/\./g, '').replace(',', '.');
    const numberValue = Number(numericText);

    if (!Number.isFinite(numberValue)) {
        return Number.NaN;
    }

    return numberValue;
}

export function formatPrecoNumberToInputBR(value: string | null): string {
    if (value === null) {
        return '';
    }

    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
        return '';
    }

    return numberValue.toFixed(2).replace('.', ',');
}
