import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonVariant = 'ghost' | 'gold';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    ariaLabel: string;
    children: ReactNode;
    variant?: IconButtonVariant;
}

function getVariantClasses(variant: IconButtonVariant): string {
    if (variant === 'gold') {
        return 'border border-[var(--color-gold)]/80 bg-transparent text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] hover:text-[var(--color-gold-light)] active:scale-95';
    }

    return 'border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-elevated)] active:scale-95';
}

export function IconButton({
    ariaLabel,
    children,
    className = '',
    disabled = false,
    type = 'button',
    variant = 'ghost',
    ...props
}: IconButtonProps) {
    return (
        <button
            type={type}
            aria-label={ariaLabel}
            disabled={disabled}
            className={`inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-[8px] p-0 transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:brightness-100 ${getVariantClasses(variant)} ${className}`.trim()}
            style={{ fontFamily: 'var(--font-body)' }}
            {...props}
        >
            {children}
        </button>
    );
}
