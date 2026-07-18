import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
    return (
        <div
            className={`rounded-[12px] bg-[var(--color-surface)] p-4 text-[var(--color-text-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.28)] sm:p-5 ${className}`.trim()}
            style={{ fontFamily: 'var(--font-body)' }}
            {...props}
        >
            {children}
        </div>
    );
}
