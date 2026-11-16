interface SeloEncaixeProps {
    className?: string;
}

export function SeloEncaixe({ className = '' }: SeloEncaixeProps) {
    return (
        <span
            className={`inline-flex min-h-6 w-fit shrink-0 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] ${className}`.trim()}
        >
            Encaixe
        </span>
    );
}
