import type { ReactNode } from 'react';

interface RadioProps {
    checked: boolean;
    onChange: () => void;
    children: ReactNode;
    className?: string;
}

export function Radio({
    checked,
    onChange,
    children,
    className = '',
}: RadioProps) {
    return (
        <label
            className={`flex cursor-pointer items-center gap-1.5 text-sm text-[var(--color-text-secondary)] ${className}`}
        >
            <input
                type="radio"
                checked={checked}
                onChange={onChange}
                className="peer sr-only"
            />
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-black bg-black peer-checked:[&>span]:opacity-100">
                <span className="h-2 w-2 rounded-full bg-[var(--color-gold)] opacity-0 transition-opacity" />
            </span>
            {children}
        </label>
    );
}
