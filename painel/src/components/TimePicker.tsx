import { useScrollTimePicker } from '../hooks/useScrollTimePicker';
import {
    HORAS_TIME_PICKER,
    MINUTOS_TIME_PICKER,
    horarioRepresentavelNoSeletor,
} from '../utils/timePicker.js';

interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
}

export function TimePicker({
    value,
    onChange,
    compact = false,
}: TimePickerProps) {
    const [selectedHour = '', selectedMinute = ''] = value.split(':');
    const selectedTimeIsRepresentable = horarioRepresentavelNoSeletor(
        selectedHour,
        selectedMinute,
    );

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
        markHourUserScrollIntent,
        markMinuteUserScrollIntent,
        handleHourScroll,
        handleMinuteScroll,
    } = useScrollTimePicker({
        value,
        hours: HORAS_TIME_PICKER,
        minutes: MINUTOS_TIME_PICKER,
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
                onWheel={markHourUserScrollIntent}
                onTouchStart={markHourUserScrollIntent}
                onTouchMove={markHourUserScrollIntent}
                onPointerDown={markHourUserScrollIntent}
                onPointerMove={(event) => {
                    if (event.buttons > 0) {
                        markHourUserScrollIntent();
                    }
                }}
                onKeyDown={(event) => {
                    if (
                        [
                            'ArrowDown',
                            'ArrowUp',
                            'End',
                            'Home',
                            'PageDown',
                            'PageUp',
                        ].includes(event.key)
                    ) {
                        markHourUserScrollIntent();
                    }
                }}
                className={columnClassName}
            >
                <div className="space-y-1">
                    {HORAS_TIME_PICKER.map((hour, index) => (
                        <button
                            key={hour}
                            ref={(element) => {
                                hourButtonRefs.current[index] = element;
                            }}
                            type="button"
                            onClick={() => handleHourSelect(hour)}
                            className={`${buttonClassName} ${selectedTimeIsRepresentable && hour === selectedHour ? 'bg-[var(--color-gold-muted)] font-semibold text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
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
                onWheel={markMinuteUserScrollIntent}
                onTouchStart={markMinuteUserScrollIntent}
                onTouchMove={markMinuteUserScrollIntent}
                onPointerDown={markMinuteUserScrollIntent}
                onPointerMove={(event) => {
                    if (event.buttons > 0) {
                        markMinuteUserScrollIntent();
                    }
                }}
                onKeyDown={(event) => {
                    if (
                        [
                            'ArrowDown',
                            'ArrowUp',
                            'End',
                            'Home',
                            'PageDown',
                            'PageUp',
                        ].includes(event.key)
                    ) {
                        markMinuteUserScrollIntent();
                    }
                }}
                className={columnClassName}
            >
                <div className="space-y-1">
                    {MINUTOS_TIME_PICKER.map((minute, index) => (
                        <button
                            key={minute}
                            ref={(element) => {
                                minuteButtonRefs.current[index] = element;
                            }}
                            type="button"
                            onClick={() => handleMinuteSelect(minute)}
                            className={`${buttonClassName} ${selectedTimeIsRepresentable && minute === selectedMinute ? 'bg-[var(--color-gold-muted)] font-semibold text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                        >
                            {minute}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
