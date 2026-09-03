import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    Calendar,
    Users,
    MoreHorizontal,
    Scissors,
    Package,
    CircleMinus,
} from 'lucide-react';

interface SubNavItem {
    label: string;
    to: string;
    icon: typeof Scissors;
}

const maisItems: SubNavItem[] = [
    { label: 'Serviços', to: '/servicos', icon: Scissors },
    { label: 'Pacotes', to: '/pacotes', icon: Package },
    { label: 'Bloqueios', to: '/bloqueios', icon: CircleMinus },
];

export function BottomNav() {
    const [menuAberto, setMenuAberto] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const isRotaMais = maisItems.some((item) =>
        location.pathname.startsWith(item.to),
    );
    const isMaisAtivo = menuAberto || isRotaMais;

    const handleNavegar = (to: string) => {
        setMenuAberto(false);
        navigate(to);
    };

    return (
        <>
            {menuAberto && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                    onClick={() => setMenuAberto(false)}
                    aria-hidden="true"
                />
            )}

            <nav
                aria-label="Navegação principal"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
                style={{ fontFamily: 'var(--font-body)' }}
            >
                <div className="relative mx-auto w-full max-w-[600px]">
                    {menuAberto && (
                        <div
                            role="menu"
                            aria-label="Menu Mais"
                            className="absolute bottom-[calc(100%+12px)] right-4 z-50 w-44 space-y-1 rounded-[16px] border border-[var(--color-gold)]/70 bg-[var(--color-surface-elevated)] p-2 shadow-[0_12px_36px_rgba(0,0,0,0.6)]"
                        >
                            {maisItems.map((item) => {
                                const Icon = item.icon;
                                const isItemAtivo =
                                    location.pathname.startsWith(item.to);
                                return (
                                    <button
                                        key={item.to}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => handleNavegar(item.to)}
                                        className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                                            isItemAtivo
                                                ? 'bg-[var(--color-gold-muted)] text-[var(--color-gold)]'
                                                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] hover:translate-x-0.5'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-110" />
                                        <span>{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <ul className="flex h-16 w-full items-stretch px-2 pb-[max(env(safe-area-inset-bottom),8px)]">
                        <li className="flex-1">
                            <NavLink
                                to="/"
                                end
                                className={({ isActive }) =>
                                    `flex h-full w-full flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold tracking-wide transition-colors hover:text-[var(--color-gold)] ${
                                        isActive
                                            ? 'text-[var(--color-gold)]'
                                            : 'text-[var(--color-text-secondary)]'
                                    }`
                                }
                                onClick={() => setMenuAberto(false)}
                            >
                                <Calendar className="h-5 w-5" />
                                <span>Agenda</span>
                            </NavLink>
                        </li>

                        <li className="flex-1">
                            <NavLink
                                to="/clientes"
                                className={({ isActive }) =>
                                    `flex h-full w-full flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold tracking-wide transition-colors hover:text-[var(--color-gold)] ${
                                        isActive
                                            ? 'text-[var(--color-gold)]'
                                            : 'text-[var(--color-text-secondary)]'
                                    }`
                                }
                                onClick={() => setMenuAberto(false)}
                            >
                                <Users className="h-5 w-5" />
                                <span>Clientes</span>
                            </NavLink>
                        </li>

                        <li className="flex-1">
                            <button
                                type="button"
                                aria-expanded={menuAberto}
                                aria-haspopup="menu"
                                onClick={() =>
                                    setMenuAberto((current) => !current)
                                }
                                className={`flex h-full w-full flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold tracking-wide transition-colors hover:text-[var(--color-gold)] ${
                                    isMaisAtivo
                                        ? 'text-[var(--color-gold)]'
                                        : 'text-[var(--color-text-secondary)]'
                                }`}
                            >
                                <MoreHorizontal className="h-5 w-5" />
                                <span>Mais</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </nav>
        </>
    );
}
