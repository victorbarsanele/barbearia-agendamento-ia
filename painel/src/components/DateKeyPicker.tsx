import { useState } from 'react';
import { CalendarGrid } from './CalendarGrid';
import { formatBrazilDateKey } from '../utils/dateTime';

interface DateKeyPickerProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export function DateKeyPicker({
    value,
    onChange,
    placeholder = 'Selecione uma data',
}: DateKeyPickerProps) {
    const [aberto, setAberto] = useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setAberto((current) => !current)}
                className="flex h-10 w-full items-center justify-between rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-left text-sm text-[var(--color-text-primary)] outline-none transition hover:border-[var(--color-gold)]"
            >
                <span>{value ? formatBrazilDateKey(value) : placeholder}</span>
                <span
                    aria-hidden="true"
                    className="text-xs text-[var(--color-text-secondary)]"
                >
                    ▣
                </span>
            </button>

            {aberto && (
                <div className="absolute left-0 right-0 top-12 z-20 max-h-[min(28rem,60vh)] overflow-y-auto rounded-[14px] bg-[var(--color-surface)] shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
                    <CalendarGrid
                        valueKey={value || null}
                        onChange={(dateKey) => {
                            onChange(dateKey);
                            setAberto(false);
                        }}
                        labels={{ title: 'Selecione uma data' }}
                        className="border-0 shadow-none"
                    />
                </div>
            )}
        </div>
    );
}
