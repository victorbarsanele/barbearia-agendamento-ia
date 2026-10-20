import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';
import { calcularScrollTopCentralizado } from '../utils/timePicker.js';

const SCROLL_DEBOUNCE_MS = 120;
const SCROLL_INTENT_TIMEOUT_MS = 240;

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
    handleHourSelect: (hour: string) => void;
    handleMinuteSelect: (minute: string) => void;
    markHourUserScrollIntent: () => void;
    markMinuteUserScrollIntent: () => void;
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
    const hourProgrammaticTargetRef = useRef<number | null>(null);
    const minuteProgrammaticTargetRef = useRef<number | null>(null);
    const hourProgrammaticTimerRef = useRef<number | null>(null);
    const minuteProgrammaticTimerRef = useRef<number | null>(null);
    const hourUserScrollIntentRef = useRef(false);
    const minuteUserScrollIntentRef = useRef(false);
    const hourUserIntentTimerRef = useRef<number | null>(null);
    const minuteUserIntentTimerRef = useRef<number | null>(null);
    const skipNextAutoAlignRef = useRef(false);

    const clearHourScrollTimer = () => {
        if (hourScrollTimerRef.current !== null) {
            window.clearTimeout(hourScrollTimerRef.current);
            hourScrollTimerRef.current = null;
        }
    };

    const clearMinuteScrollTimer = () => {
        if (minuteScrollTimerRef.current !== null) {
            window.clearTimeout(minuteScrollTimerRef.current);
            minuteScrollTimerRef.current = null;
        }
    };

    const clearProgrammaticTarget = (
        targetRef: MutableRefObject<number | null>,
        timerRef: MutableRefObject<number | null>,
    ) => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        targetRef.current = null;
    };

    const clearUserScrollIntent = (
        intentRef: MutableRefObject<boolean>,
        timerRef: MutableRefObject<number | null>,
    ) => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        intentRef.current = false;
    };

    const markUserScrollIntent = (
        intentRef: MutableRefObject<boolean>,
        timerRef: MutableRefObject<number | null>,
    ) => {
        intentRef.current = true;
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
            intentRef.current = false;
            timerRef.current = null;
        }, SCROLL_INTENT_TIMEOUT_MS);
    };

    const refreshUserScrollIntent = (
        intentRef: MutableRefObject<boolean>,
        timerRef: MutableRefObject<number | null>,
    ) => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
            intentRef.current = false;
            timerRef.current = null;
        }, SCROLL_INTENT_TIMEOUT_MS);
    };

    useEffect(() => {
        return () => {
            clearHourScrollTimer();
            clearMinuteScrollTimer();
            clearProgrammaticTarget(
                hourProgrammaticTargetRef,
                hourProgrammaticTimerRef,
            );
            clearProgrammaticTarget(
                minuteProgrammaticTargetRef,
                minuteProgrammaticTimerRef,
            );
            clearUserScrollIntent(
                hourUserScrollIntentRef,
                hourUserIntentTimerRef,
            );
            clearUserScrollIntent(
                minuteUserScrollIntentRef,
                minuteUserIntentTimerRef,
            );
        };
    }, []);

    useEffect(() => {
        if (skipNextAutoAlignRef.current) {
            skipNextAutoAlignRef.current = false;
            return;
        }

        if (
            !hours.includes(selectedHour) ||
            !minutes.includes(selectedMinute)
        ) {
            return;
        }

        const alignColumn = (
            column: HTMLDivElement | null,
            buttons: Array<HTMLButtonElement | null>,
            values: string[],
            selected: string,
            targetRef: MutableRefObject<number | null>,
            targetTimerRef: MutableRefObject<number | null>,
        ) => {
            const index = values.indexOf(selected);
            const button = index >= 0 ? buttons[index] : null;

            if (button && column) {
                const columnRect = column.getBoundingClientRect();
                const buttonRect = button.getBoundingClientRect();
                const target = calcularScrollTopCentralizado({
                    columnTop: columnRect.top,
                    columnScrollTop: column.scrollTop,
                    columnClientHeight: column.clientHeight,
                    columnScrollHeight: column.scrollHeight,
                    itemTop: buttonRect.top,
                    itemHeight: button.clientHeight,
                });

                if (Math.abs(column.scrollTop - target) <= 1) {
                    return;
                }

                clearProgrammaticTarget(targetRef, targetTimerRef);
                targetRef.current = target;
                targetTimerRef.current = window.setTimeout(() => {
                    targetRef.current = null;
                    targetTimerRef.current = null;
                }, SCROLL_INTENT_TIMEOUT_MS);
                column.scrollTop = target;
            }
        };

        alignColumn(
            hourColumnRef.current,
            hourButtonRefs.current,
            hours,
            selectedHour,
            hourProgrammaticTargetRef,
            hourProgrammaticTimerRef,
        );
        alignColumn(
            minuteColumnRef.current,
            minuteButtonRefs.current,
            minutes,
            selectedMinute,
            minuteProgrammaticTargetRef,
            minuteProgrammaticTimerRef,
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

    const handleHourSelect = (hour: string) => {
        clearHourScrollTimer();
        clearMinuteScrollTimer();
        clearUserScrollIntent(hourUserScrollIntentRef, hourUserIntentTimerRef);
        clearUserScrollIntent(
            minuteUserScrollIntentRef,
            minuteUserIntentTimerRef,
        );
        emitHourChange(hour);
    };

    const handleMinuteSelect = (minute: string) => {
        clearHourScrollTimer();
        clearMinuteScrollTimer();
        clearUserScrollIntent(hourUserScrollIntentRef, hourUserIntentTimerRef);
        clearUserScrollIntent(
            minuteUserScrollIntentRef,
            minuteUserIntentTimerRef,
        );
        emitMinuteChange(minute);
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

        const center =
            column.getBoundingClientRect().top + column.clientHeight / 2;
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
        const column = hourColumnRef.current;
        if (!column) {
            return;
        }
        const target = hourProgrammaticTargetRef.current;
        if (target !== null && Math.abs(column.scrollTop - target) <= 1) {
            clearProgrammaticTarget(
                hourProgrammaticTargetRef,
                hourProgrammaticTimerRef,
            );
            return;
        }
        if (!hourUserScrollIntentRef.current) {
            return;
        }

        clearProgrammaticTarget(
            hourProgrammaticTargetRef,
            hourProgrammaticTimerRef,
        );
        refreshUserScrollIntent(
            hourUserScrollIntentRef,
            hourUserIntentTimerRef,
        );
        clearMinuteScrollTimer();
        clearHourScrollTimer();

        hourScrollTimerRef.current = window.setTimeout(() => {
            hourScrollTimerRef.current = null;
            selectClosestValue(
                hourColumnRef.current,
                hourButtonRefs.current,
                hours,
                selectedHour,
                emitHourChange,
            );
        }, SCROLL_DEBOUNCE_MS);
    };

    const handleMinuteScroll = () => {
        const column = minuteColumnRef.current;
        if (!column) {
            return;
        }
        const target = minuteProgrammaticTargetRef.current;
        if (target !== null && Math.abs(column.scrollTop - target) <= 1) {
            clearProgrammaticTarget(
                minuteProgrammaticTargetRef,
                minuteProgrammaticTimerRef,
            );
            return;
        }
        if (!minuteUserScrollIntentRef.current) {
            return;
        }

        clearProgrammaticTarget(
            minuteProgrammaticTargetRef,
            minuteProgrammaticTimerRef,
        );
        refreshUserScrollIntent(
            minuteUserScrollIntentRef,
            minuteUserIntentTimerRef,
        );
        clearHourScrollTimer();
        clearMinuteScrollTimer();

        minuteScrollTimerRef.current = window.setTimeout(() => {
            minuteScrollTimerRef.current = null;
            selectClosestValue(
                minuteColumnRef.current,
                minuteButtonRefs.current,
                minutes,
                selectedMinute,
                emitMinuteChange,
            );
        }, SCROLL_DEBOUNCE_MS);
    };

    const markHourUserScrollIntent = () => {
        markUserScrollIntent(hourUserScrollIntentRef, hourUserIntentTimerRef);
    };

    const markMinuteUserScrollIntent = () => {
        markUserScrollIntent(
            minuteUserScrollIntentRef,
            minuteUserIntentTimerRef,
        );
    };

    return {
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
    };
}
