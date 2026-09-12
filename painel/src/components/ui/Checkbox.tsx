import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    children: ReactNode;
    disabled?: boolean;
    className?: string;
}

export function Checkbox({
    checked,
    onChange,
    children,
    disabled = false,
    className = '',
}: CheckboxProps) {
    return (
        <label
            className={`flex items-center gap-2 text-sm text-[var(--color-text-secondary)] ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${className}`}
        >
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                className="peer sr-only"
            />
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--color-gold)]/30 bg-[var(--color-surface)] peer-checked:border-[var(--color-gold)] peer-checked:bg-[var(--color-gold)] peer-checked:[&>svg]:opacity-100">
                <Check
                    className="h-3 w-3 text-black opacity-0"
                    strokeWidth={3}
                />
            </span>
            {children}
        </label>
    );
}
