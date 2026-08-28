import { useMemo, useState } from 'react';
import { createBrazilDate, getBrazilDateParts } from '../utils/dateTime';

type CalendarGridLabels = {
    title: string;
};

type CalendarGridProps = {
    valueKey: string | null;
    onChange: (dateKey: string) => void;
    minDateKey?: string | null;
    maxDateKey?: string | null;
    labels?: CalendarGridLabels;
    className?: string;
};

const TIME_ZONE = 'America/Sao_Paulo';
const WEEKDAY_LABELS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

function getMonthLabel(date: Date): string {
    const label = new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        month: 'long',
        year: 'numeric',
    }).format(date);

    return label.charAt(0).toUpperCase() + label.slice(1);
}

function getWeekdayIndex(
    year: number,
    monthIndex: number,
    day: number,
): number {
    return new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
}

function getDisplayWeekdayIndex(
    year: number,
    monthIndex: number,
    day: number,
): number {
    const weekdayIndex = getWeekdayIndex(year, monthIndex, day);

    return weekdayIndex === 0 ? 6 : weekdayIndex - 1;
}

function isDaySelectable(
    dateKey: string,
    minDateKey: string | null,
    maxDateKey: string | null,
): boolean {
    if (minDateKey && dateKey < minDateKey) {
        return false;
    }

    if (maxDateKey && dateKey > maxDateKey) {
        return false;
    }

    return true;
}

function dateKeyToViewDate(dateKey: string): Date {
    return new Date(`${dateKey}T12:00:00-03:00`);
}

export function CalendarGrid({
    valueKey,
    onChange,
    minDateKey,
    maxDateKey,
    labels,
    className = '',
}: CalendarGridProps) {
    const [viewDate, setViewDate] = useState<Date>(() => {
        if (valueKey) {
            return dateKeyToViewDate(valueKey);
        }

        if (minDateKey) {
            return dateKeyToViewDate(minDateKey);
        }

        return new Date();
    });

    const displayParts = getBrazilDateParts(viewDate);
    const monthStartWeekdayIndex = getDisplayWeekdayIndex(
        displayParts.year,
        displayParts.monthIndex,
        1,
    );

    const calendarDays = useMemo(() => {
        const startDay = 1 - monthStartWeekdayIndex;

        return Array.from({ length: 42 }, (_, index) => {
            const cellUtcDate = new Date(
                Date.UTC(
                    displayParts.year,
                    displayParts.monthIndex,
                    startDay + index,
                    12,
                    0,
                ),
            );
            const cellParts = {
                year: cellUtcDate.getUTCFullYear(),
                monthIndex: cellUtcDate.getUTCMonth(),
                day: cellUtcDate.getUTCDate(),
            };

            return {
                dateKey: `${String(cellParts.year).padStart(4, '0')}-${String(
                    cellParts.monthIndex + 1,
                ).padStart(2, '0')}-${String(cellParts.day).padStart(2, '0')}`,
                day: cellParts.day,
                inCurrentMonth:
                    cellParts.year === displayParts.year &&
                    cellParts.monthIndex === displayParts.monthIndex,
            };
        });
    }, [displayParts.monthIndex, displayParts.year, monthStartWeekdayIndex]);

    const canGoPrevMonth = !minDateKey
        ? true
        : `${String(displayParts.year).padStart(4, '0')}-${String(
              displayParts.monthIndex + 1,
          ).padStart(2, '0')}` >
          `${String(getBrazilDateParts(dateKeyToViewDate(minDateKey)).year).padStart(4, '0')}-${String(
              getBrazilDateParts(dateKeyToViewDate(minDateKey)).monthIndex + 1,
          ).padStart(2, '0')}`;
    const canGoNextMonth = !maxDateKey
        ? true
        : `${String(displayParts.year).padStart(4, '0')}-${String(
              displayParts.monthIndex + 1,
          ).padStart(2, '0')}` <
          `${String(getBrazilDateParts(dateKeyToViewDate(maxDateKey)).year).padStart(4, '0')}-${String(
              getBrazilDateParts(dateKeyToViewDate(maxDateKey)).monthIndex + 1,
          ).padStart(2, '0')}`;

    const goToPreviousMonth = () => {
        if (!canGoPrevMonth) {
            return;
        }

        setViewDate(
            createBrazilDate(
                displayParts.year,
                displayParts.monthIndex - 1,
                1,
                12,
                0,
            ),
        );
    };

    const goToNextMonth = () => {
        if (!canGoNextMonth) {
            return;
        }

        setViewDate(
            createBrazilDate(
                displayParts.year,
                displayParts.monthIndex + 1,
                1,
                12,
                0,
            ),
        );
    };

    const handleDaySelect = (dateKey: string, selectable: boolean) => {
        if (!selectable) {
            return;
        }

        onChange(dateKey);
        setViewDate(dateKeyToViewDate(dateKey));
    };

    return (
        <div
            className={`rounded-[14px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.02)] p-3 ${className}`.trim()}
        >
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                        {labels?.title ?? 'Selecione uma data'}
                    </p>
                    <p
                        className="mt-1 text-lg font-semibold text-[var(--color-text-primary)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        {getMonthLabel(viewDate)}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={goToPreviousMonth}
                        disabled={!canGoPrevMonth}
                        aria-label="Mês anterior"
                        className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-gold)] transition hover:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <span aria-hidden="true">‹</span>
                    </button>
                    <button
                        type="button"
                        onClick={goToNextMonth}
                        disabled={!canGoNextMonth}
                        aria-label="Próximo mês"
                        className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-gold)] transition hover:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <span aria-hidden="true">›</span>
                    </button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-px border border-[var(--color-border)] bg-[var(--color-border)] text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                {WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="bg-[var(--color-surface)] py-2">
                        {label}
                    </div>
                ))}
            </div>

            <div className="mt-px grid grid-cols-7 gap-px border border-[var(--color-border)] bg-[var(--color-border)] text-sm">
                {calendarDays.map((cell, index) => {
                    const selectable = isDaySelectable(
                        cell.dateKey,
                        minDateKey ?? null,
                        maxDateKey ?? null,
                    );
                    const isSelected = valueKey === cell.dateKey;

                    return (
                        <button
                            key={`${cell.dateKey}-${index}`}
                            type="button"
                            onClick={() =>
                                handleDaySelect(cell.dateKey, selectable)
                            }
                            disabled={!selectable}
                            className={`min-h-11 bg-[var(--color-surface)] px-2 py-2 text-center transition ${cell.inCurrentMonth ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] opacity-50'} ${isSelected ? 'border border-[var(--color-gold)] text-[var(--color-gold)]' : 'border border-transparent hover:border-[var(--color-gold)]/40 hover:bg-[var(--color-gold)]/10'} disabled:cursor-not-allowed disabled:hover:border-transparent disabled:hover:bg-[var(--color-surface)]`.trim()}
                            aria-pressed={isSelected}
                        >
                            {cell.day}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
