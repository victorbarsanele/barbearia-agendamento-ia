import { useScrollTimePicker } from '../hooks/useScrollTimePicker';

interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
}

const HOURS = Array.from({ length: 17 }, (_, index) =>
    String(index + 6).padStart(2, '0'),
);
const MINUTES = ['00', '15', '30', '45'];

export function TimePicker({
    value,
    onChange,
    compact = false,
}: TimePickerProps) {
    const [selectedHour = '', selectedMinute = ''] = value.split(':');

    const selectHour = (hour: string) => {
        onChange(`${hour}:${selectedMinute || '00'}`);
    };

    const selectMinute = (minute: string) => {
        onChange(`${selectedHour || '06'}:${minute}`);
    };

    const {
        hourColumnRef,
        minuteColumnRef,
        hourButtonRefs,
        minuteButtonRefs,
        handleHourSelect,
        handleMinuteSelect,
        handleHourScroll,
        handleMinuteScroll,
    } = useScrollTimePicker({
        value,
        hours: HOURS,
        minutes: MINUTES,
        onHourChange: selectHour,
        onMinuteChange: selectMinute,
    });

    const columnClassName = compact
        ? 'date-time-picker-scrollbar-hidden h-28 overflow-y-auto rounded-[10px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.02)] px-1 py-10'
        : 'date-time-picker-scrollbar-hidden h-56 overflow-y-auto rounded-[14px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.02)] px-2 py-23';
    const buttonClassName = compact
        ? 'flex h-8 w-full items-center justify-center rounded-[8px] px-2 text-sm transition'
        : 'flex h-10 w-full items-center justify-center rounded-[10px] px-3 text-base transition';

    return (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div
                ref={hourColumnRef}
                onScroll={handleHourScroll}
                className={columnClassName}
            >
                <div className="space-y-1">
                    {HOURS.map((hour) => (
                        <button
                            key={hour}
                            ref={(element) => {
                                hourButtonRefs.current[HOURS.indexOf(hour)] =
                                    element;
                            }}
                            type="button"
                            onClick={() => handleHourSelect(hour)}
                            className={`${buttonClassName} ${hour === selectedHour ? 'bg-[var(--color-gold-muted)] font-semibold text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                        >
                            {hour}
                        </button>
                    ))}
                </div>
            </div>
            <span className="text-lg font-semibold text-[var(--color-text-secondary)]">
                :
            </span>
            <div
                ref={minuteColumnRef}
                onScroll={handleMinuteScroll}
                className={columnClassName}
            >
                <div className="space-y-1">
                    {MINUTES.map((minute) => (
                        <button
                            key={minute}
                            ref={(element) => {
                                minuteButtonRefs.current[
                                    MINUTES.indexOf(minute)
                                ] = element;
                            }}
                            type="button"
                            onClick={() => handleMinuteSelect(minute)}
                            className={`${buttonClassName} ${minute === selectedMinute ? 'bg-[var(--color-gold-muted)] font-semibold text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                        >
                            {minute}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
