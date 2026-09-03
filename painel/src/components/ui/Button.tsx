import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'danger' | 'ghost' | 'outline';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    children: ReactNode;
    fullWidth?: boolean;
}

function getVariantClasses(variant: ButtonVariant): string {
    switch (variant) {
        case 'danger':
            return 'bg-[var(--color-danger)] text-white hover:brightness-110 active:scale-95';
        case 'outline':
            return 'border border-[var(--color-gold)]/80 bg-transparent text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] hover:text-[var(--color-gold-light)] active:scale-95';
        case 'ghost':
            return 'border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-elevated)] active:scale-95';
        case 'primary':
        default:
            return 'bg-[var(--color-gold)] text-[#0a0a0a] hover:bg-[var(--color-gold-light)] hover:brightness-105 active:scale-95';
    }
}

export function Button({
    variant = 'primary',
    children,
    className = '',
    fullWidth = false,
    type = 'button',
    ...props
}: ButtonProps) {
    const baseClasses =
        'inline-flex min-h-10 touch-manipulation items-center justify-center rounded-[8px] px-3.5 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:brightness-100';

    const widthClass = fullWidth ? 'w-full' : 'w-fit';

    return (
        <button
            type={type}
            className={`${baseClasses} ${widthClass} ${getVariantClasses(variant)} ${className}`.trim()}
            style={{ fontFamily: 'var(--font-body)' }}
            {...props}
        >
            {children}
        </button>
    );
}
