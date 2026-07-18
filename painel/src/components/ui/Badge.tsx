import type { HTMLAttributes } from 'react';

export type AgendamentoStatus =
    | 'AGENDADO'
    | 'CANCELADO'
    | 'CONFIRMADO'
    | 'CONCLUIDO';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    status: AgendamentoStatus;
}

function getStatusStyles(status: AgendamentoStatus): string {
    switch (status) {
        case 'AGENDADO':
            return 'border border-[var(--color-gold)]/35 bg-[var(--color-gold-muted)] text-[var(--color-gold)]';
        case 'CANCELADO':
            return 'border border-[var(--color-danger)]/35 bg-[color:rgba(220,38,38,0.16)] text-[#fca5a5]';
        case 'CONFIRMADO':
            return 'border border-[var(--color-success)]/35 bg-[color:rgba(22,163,74,0.16)] text-[#86efac]';
        case 'CONCLUIDO':
        default:
            return 'border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-text-secondary)]';
    }
}

export function Badge({ status, className = '', ...props }: BadgeProps) {
    return (
        <span
            className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getStatusStyles(status)} ${className}`.trim()}
            style={{ fontFamily: 'var(--font-body)' }}
            {...props}
        >
            {status}
        </span>
    );
}
