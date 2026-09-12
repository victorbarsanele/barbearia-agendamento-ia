import { useEffect, useState } from 'react';
import { CalendarGrid } from './CalendarGrid';
import { useScrollTimePicker } from '../hooks/useScrollTimePicker';
import {
    createBrazilDate,
    getBrazilDateKey,
    getBrazilDateParts,
} from '../utils/dateTime';

type DateTimePickerProps = {
    value: Date | null;
    onChange: (date: Date) => void;
    minDate?: Date;
    maxDate?: Date;
    className?: string;
    labels?: {
        dateTitle: string;
        timeTitle: string;
    };
};

const HOURS = Array.from({ length: 17 }, (_, index) =>
    String(index + 6).padStart(2, '0'),
);
const MINUTES = ['00', '15', '30', '45'];

export function DateTimePicker({
    value,
    onChange,
    minDate,
    maxDate,
    className = '',
    labels,
}: DateTimePickerProps) {
    const [viewDate, setViewDate] = useState<Date>(
        () => value ?? minDate ?? new Date(),
    );

    useEffect(() => {
        if (value) {
            setViewDate(value);
        }
    }, [value]);

    const valueParts = value ? getBrazilDateParts(value) : null;
    const selectedHour = valueParts?.hour ?? '';
    const selectedMinute = valueParts?.minute ?? '';

    const emitDate = (date: Date) => {
        // Evita realinhar scroll quando mudança veio da própria interação interna.
        setViewDate(date);
        onChange(date);
    };

    const getActiveDate = (): Date => {
        const parts = getBrazilDateParts(value ?? viewDate);

        const hour = selectedHour || parts.hour || '06';
        const minute = selectedMinute || parts.minute || '00';

        return createBrazilDate(
            parts.year,
            parts.monthIndex,
            parts.day,
            Number(hour),
            Number(minute),
        );
    };

    const handleHourSelect = (hour: string) => {
        const activeDate = getActiveDate();
        const activeParts = getBrazilDateParts(activeDate);

        emitDate(
            createBrazilDate(
                activeParts.year,
                activeParts.monthIndex,
                activeParts.day,
                Number(hour),
                Number(activeParts.minute),
            ),
        );
    };

    const handleMinuteSelect = (minute: string) => {
        const activeDate = getActiveDate();
        const activeParts = getBrazilDateParts(activeDate);

        emitDate(
            createBrazilDate(
                activeParts.year,
                activeParts.monthIndex,
                activeParts.day,
                Number(activeParts.hour),
                Number(minute),
            ),
        );
    };

    const {
        hourColumnRef,
        minuteColumnRef,
        hourButtonRefs,
        minuteButtonRefs,
        handleHourScroll,
        handleMinuteScroll,
    } = useScrollTimePicker({
        value: `${selectedHour}:${selectedMinute}`,
        hours: HOURS,
        minutes: MINUTES,
        onHourChange: handleHourSelect,
        onMinuteChange: handleMinuteSelect,
    });

    return (
        <div
            className={`rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[0_10px_28px_rgba(0,0,0,0.24)] ${className}`.trim()}
        >
            <CalendarGrid
                key={value ? getBrazilDateKey(value) : 'calendar-empty'}
                valueKey={value ? getBrazilDateKey(value) : null}
                onChange={(dateKey) => {
                    const nextDate = new Date(
                        `${dateKey}T${selectedHour || '06'}:${selectedMinute || '00'}:00-03:00`,
                    );
                    setViewDate(nextDate);
                    onChange(nextDate);
                }}
                minDateKey={minDate ? getBrazilDateKey(minDate) : null}
                maxDateKey={maxDate ? getBrazilDateKey(maxDate) : null}
                labels={{
                    title: labels?.dateTitle ?? 'Selecione uma data',
                }}
            />

            <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                    {labels?.timeTitle ?? 'Selecione um horário'}
                </p>

                <div className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-3">
                    <div>
                        <div
                            ref={hourColumnRef}
                            onScroll={handleHourScroll}
                            className="date-time-picker-scrollbar-hidden h-56 overflow-y-auto rounded-[14px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.02)] px-2 py-16"
                        >
                            <div className="space-y-1">
                                {HOURS.map((hour, index) => {
                                    const isSelected = hour === selectedHour;

                                    return (
                                        <button
                                            key={hour}
                                            ref={(element) => {
                                                hourButtonRefs.current[index] =
                                                    element;
                                            }}
                                            type="button"
                                            onClick={() =>
                                                handleHourSelect(hour)
                                            }
                                            className={`flex h-10 w-full items-center justify-center rounded-[10px] px-3 text-base transition ${isSelected ? 'bg-[var(--color-gold-muted)] font-semibold text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`.trim()}
                                        >
                                            {hour}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-center text-2xl font-semibold text-[var(--color-text-secondary)]">
                        :
                    </div>

                    <div>
                        <div
                            ref={minuteColumnRef}
                            onScroll={handleMinuteScroll}
                            className="date-time-picker-scrollbar-hidden h-56 overflow-y-auto rounded-[14px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.02)] px-2 py-16"
                        >
                            <div className="space-y-1">
                                {MINUTES.map((minute, index) => {
                                    const isSelected =
                                        minute === selectedMinute;

                                    return (
                                        <button
                                            key={minute}
                                            ref={(element) => {
                                                minuteButtonRefs.current[
                                                    index
                                                ] = element;
                                            }}
                                            type="button"
                                            onClick={() =>
                                                handleMinuteSelect(minute)
                                            }
                                            className={`flex h-10 w-full items-center justify-center rounded-[10px] px-3 text-base transition ${isSelected ? 'bg-[var(--color-gold-muted)] font-semibold text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`.trim()}
                                        >
                                            {minute}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
