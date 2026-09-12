import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';

interface UseScrollTimePickerOptions {
    value: string;
    hours: string[];
    minutes: string[];
    onHourChange: (hour: string) => void;
    onMinuteChange: (minute: string) => void;
}

interface UseScrollTimePickerResult {
    hourColumnRef: RefObject<HTMLDivElement | null>;
    minuteColumnRef: RefObject<HTMLDivElement | null>;
    hourButtonRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
    minuteButtonRefs: MutableRefObject<Array<HTMLButtonElement | null>>;
    handleHourScroll: () => void;
    handleMinuteScroll: () => void;
}

export function useScrollTimePicker({
    value,
    hours,
    minutes,
    onHourChange,
    onMinuteChange,
}: UseScrollTimePickerOptions): UseScrollTimePickerResult {
    const [selectedHour = '', selectedMinute = ''] = value.split(':');
    const hourColumnRef = useRef<HTMLDivElement | null>(null);
    const minuteColumnRef = useRef<HTMLDivElement | null>(null);
    const hourButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const minuteButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const hourScrollTimerRef = useRef<number | null>(null);
    const minuteScrollTimerRef = useRef<number | null>(null);
    const skipNextAutoAlignRef = useRef(false);

    useEffect(() => {
        return () => {
            if (hourScrollTimerRef.current !== null) {
                window.clearTimeout(hourScrollTimerRef.current);
            }
            if (minuteScrollTimerRef.current !== null) {
                window.clearTimeout(minuteScrollTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (skipNextAutoAlignRef.current) {
            skipNextAutoAlignRef.current = false;
            return;
        }

        const alignColumn = (
            column: HTMLDivElement | null,
            buttons: Array<HTMLButtonElement | null>,
            values: string[],
            selected: string,
        ) => {
            const index = values.indexOf(selected);
            const button = index >= 0 ? buttons[index] : null;

            if (button && column) {
                column.scrollTop =
                    button.offsetTop -
                    column.clientHeight / 2 +
                    button.clientHeight / 2;
            }
        };

        alignColumn(hourColumnRef.current, hourButtonRefs.current, hours, selectedHour);
        alignColumn(
            minuteColumnRef.current,
            minuteButtonRefs.current,
            minutes,
            selectedMinute,
        );
    }, [hours, minutes, selectedHour, selectedMinute]);

    const emitHourChange = (hour: string) => {
        skipNextAutoAlignRef.current = true;
        onHourChange(hour);
    };

    const emitMinuteChange = (minute: string) => {
        skipNextAutoAlignRef.current = true;
        onMinuteChange(minute);
    };

    const selectClosestValue = (
        column: HTMLDivElement | null,
        buttons: Array<HTMLButtonElement | null>,
        values: string[],
        current: string,
        onSelect: (value: string) => void,
    ) => {
        if (!column) {
            return;
        }

        const center = column.getBoundingClientRect().top + column.clientHeight / 2;
        let closest = current;
        let closestDistance = Number.POSITIVE_INFINITY;

        buttons.forEach((button, index) => {
            if (!button) {
                return;
            }

            const buttonCenter =
                button.getBoundingClientRect().top + button.clientHeight / 2;
            const distance = Math.abs(buttonCenter - center);

            if (distance < closestDistance) {
                closestDistance = distance;
                closest = values[index] ?? current;
            }
        });

        if (closest && closest !== current) {
            onSelect(closest);
        }
    };

    const handleHourScroll = () => {
        if (hourScrollTimerRef.current !== null) {
            window.clearTimeout(hourScrollTimerRef.current);
        }

        hourScrollTimerRef.current = window.setTimeout(() => {
            selectClosestValue(
                hourColumnRef.current,
                hourButtonRefs.current,
                hours,
                selectedHour,
                emitHourChange,
            );
        }, 120);
    };

    const handleMinuteScroll = () => {
        if (minuteScrollTimerRef.current !== null) {
            window.clearTimeout(minuteScrollTimerRef.current);
        }

        minuteScrollTimerRef.current = window.setTimeout(() => {
            selectClosestValue(
                minuteColumnRef.current,
                minuteButtonRefs.current,
                minutes,
                selectedMinute,
                emitMinuteChange,
            );
        }, 120);
    };

    return {
        hourColumnRef,
        minuteColumnRef,
        hourButtonRefs,
        minuteButtonRefs,
        handleHourScroll,
        handleMinuteScroll,
    };
}
