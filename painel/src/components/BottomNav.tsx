import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
    label: string;
    to: string;
    icon: (active: boolean) => ReactElement;
}

function CalendarIcon(active: boolean) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-5 w-5 ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)]'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
    );
}

function UserIcon(active: boolean) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-5 w-5 ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)]'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
    );
}

function ScissorsIcon(active: boolean) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-5 w-5 ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)]'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="6" cy="6" r="2.5" />
            <circle cx="6" cy="18" r="2.5" />
            <path d="M20 4 8 14M20 20 11 13M14 10l6 10" />
        </svg>
    );
}

function LockIcon(active: boolean) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-5 w-5 ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)]'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

function PackageIcon(active: boolean) {
    return (
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={`h-5 w-5 ${active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-secondary)]'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
            <path d="M3 8l9 5 9-5M12 13v8" />
        </svg>
    );
}

const navItems: NavItem[] = [
    { label: 'Agenda', to: '/', icon: CalendarIcon },
    { label: 'Clientes', to: '/clientes', icon: UserIcon },
    { label: 'Serviços', to: '/servicos', icon: ScissorsIcon },
    { label: 'Pacotes', to: '/pacotes', icon: PackageIcon },
    { label: 'Bloqueios', to: '/bloqueios', icon: LockIcon },
];

export function BottomNav() {
    return (
        <nav
            aria-label="Navegação principal"
            className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
            style={{ fontFamily: 'var(--font-body)' }}
        >
            <ul className="mx-auto flex h-16 w-full max-w-[600px] items-stretch px-2 pb-[max(env(safe-area-inset-bottom),8px)]">
                {navItems.map((item) => (
                    <li key={item.to} className="flex-1">
                        <NavLink
                            to={item.to}
                            className={({ isActive }) =>
                                `flex h-full w-full flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold tracking-wide transition-colors ${
                                    isActive
                                        ? 'text-[var(--color-gold)]'
                                        : 'text-[var(--color-text-secondary)]'
                                }`
                            }
                            end={item.to === '/'}
                        >
                            {({ isActive }) => (
                                <>
                                    {item.icon(isActive)}
                                    <span>{item.label}</span>
                                </>
                            )}
                        </NavLink>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
