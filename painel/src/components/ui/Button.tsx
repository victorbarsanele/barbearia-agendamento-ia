import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    children: ReactNode;
    fullWidth?: boolean;
}

function getVariantClasses(variant: ButtonVariant): string {
    switch (variant) {
        case 'danger':
            return 'bg-[var(--color-danger)] text-white hover:brightness-110';
        case 'ghost':
            return 'border border-[var(--color-border)] bg-transparent text-[var(--color-text-primary)] hover:border-[var(--color-gold)] hover:bg-[var(--color-surface-elevated)]';
        case 'primary':
        default:
            return 'bg-[var(--color-gold)] text-[#0a0a0a] hover:bg-[var(--color-gold-light)]';
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
        'inline-flex min-h-10 touch-manipulation items-center justify-center rounded-[8px] px-3.5 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60';

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
