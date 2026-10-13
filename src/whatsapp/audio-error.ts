export interface SafeErrorDescription {
    name: string;
    code?: string;
    status?: number;
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : null;
}

export function describeSafeError(error: unknown): SafeErrorDescription {
    const record = readRecord(error);
    const cause = readRecord(record?.cause);
    const codeValue = record?.code ?? cause?.code;
    const statusValue =
        record?.status ??
        record?.statusCode ??
        cause?.status ??
        cause?.statusCode;
    const description: SafeErrorDescription = {
        name:
            error instanceof Error && error.name
                ? error.name
                : 'UnknownError',
    };

    if (typeof codeValue === 'string' && codeValue.length <= 100) {
        description.code = codeValue;
    }

    if (
        typeof statusValue === 'number' &&
        Number.isInteger(statusValue) &&
        statusValue >= 100 &&
        statusValue <= 599
    ) {
        description.status = statusValue;
    }

    return description;
}
