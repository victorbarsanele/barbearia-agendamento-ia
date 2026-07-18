const TIME_ZONE = 'America/Sao_Paulo';

export interface BrazilDateParts {
    year: number;
    monthIndex: number;
    day: number;
    hour: string;
    minute: string;
}

export function getBrazilDateParts(date: Date): BrazilDateParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const year = Number(
        parts.find((part) => part.type === 'year')?.value ?? '1970',
    );
    const month = Number(
        parts.find((part) => part.type === 'month')?.value ?? '01',
    );
    const day = Number(
        parts.find((part) => part.type === 'day')?.value ?? '01',
    );
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

    return {
        year,
        monthIndex: month - 1,
        day,
        hour,
        minute,
    };
}

export function getBrazilDateKey(date: Date): string {
    const parts = getBrazilDateParts(date);

    return `${String(parts.year).padStart(4, '0')}-${String(
        parts.monthIndex + 1,
    ).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function createBrazilDate(
    year: number,
    monthIndex: number,
    day: number,
    hour = 12,
    minute = 0,
): Date {
    return new Date(
        `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`,
    );
}
