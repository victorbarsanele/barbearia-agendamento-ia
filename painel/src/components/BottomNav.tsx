import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
    Calendar,
    Users,
    MoreHorizontal,
    Scissors,
    Package,
    CircleMinus,
    Clock3,
    X,
    ChevronRight,
    LogOut,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface SubNavItem {
    label: string;
    to: string;
    icon: typeof Scissors;
}

const maisItems: SubNavItem[] = [
    { label: 'Serviços', to: '/servicos', icon: Scissors },
    { label: 'Pacotes', to: '/pacotes', icon: Package },
    { label: 'Bloqueios', to: '/bloqueios', icon: CircleMinus },
    { label: 'Horários', to: '/horarios', icon: Clock3 },
];

export function BottomNav() {
    const [menuAberto, setMenuAberto] = useState(false);
    const [inicioArraste, setInicioArraste] = useState<number | null>(null);
    const location = useLocation();
    const navigate = useNavigate();
    const { logout } = useAuth();

    const isRotaMais = maisItems.some((item) =>
        location.pathname.startsWith(item.to),
    );
    const isMaisAtivo = menuAberto || isRotaMais;

    const handleNavegar = (to: string) => {
        setMenuAberto(false);
        navigate(to);
    };

    const handleFimArraste = (clientY: number) => {
        if (inicioArraste !== null && clientY - inicioArraste > 60) {
            setMenuAberto(false);
        }
        setInicioArraste(null);
    };

    return (
        <>
            {menuAberto && (
                <div
                    data-testid="mais-overlay"
                    className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
                    onClick={() => setMenuAberto(false)}
                    aria-hidden="true"
                />
            )}

            {menuAberto && (
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mais-opcoes-titulo"
                    className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[600px] rounded-t-[28px] border-t border-[var(--color-border)] bg-[var(--color-surface)] px-6 pb-[max(env(safe-area-inset-bottom),24px)] pt-3 shadow-[0_-12px_40px_rgba(0,0,0,0.45)]"
                >
                    <button
                        type="button"
                        aria-label="Arrastar para fechar"
                        className="mx-auto mb-5 block h-1 w-12 rounded-full bg-[var(--color-text-secondary)]/40"
                        onPointerDown={(event) => {
                            event.currentTarget.setPointerCapture(
                                event.pointerId,
                            );
                            setInicioArraste(event.clientY);
                        }}
                        onPointerUp={(event) => handleFimArraste(event.clientY)}
                    />

                    <div className="mb-6 flex items-center justify-between">
                        <h2
                            id="mais-opcoes-titulo"
                            className="text-lg font-bold text-[var(--color-text-primary)]"
                        >
                            Mais opções
                        </h2>
                        <button
                            type="button"
                            aria-label="Fechar menu Mais"
                            onClick={() => setMenuAberto(false)}
                            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--color-border)] text-[var(--color-text-secondary)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="space-y-2">
                        {maisItems.map((item, index) => {
                            const Icon = item.icon;
                            const iconStyles = [
                                'bg-[var(--color-gold-muted)] text-[var(--color-gold)]',
                                'bg-amber-500/10 text-amber-400',
                                'bg-sky-500/10 text-sky-400',
                                'bg-emerald-500/10 text-emerald-400',
                            ];
                            return (
                                <button
                                    key={item.to}
                                    type="button"
                                    onClick={() => handleNavegar(item.to)}
                                    className="flex min-h-14 w-full items-center gap-4 rounded-[12px] border border-[var(--color-border)] px-4 text-left transition hover:border-[var(--color-gold)]/50 hover:bg-[var(--color-surface-elevated)]"
                                >
                                    <span
                                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${iconStyles[index]}`}
                                    >
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <span className="flex-1 text-base font-semibold text-[var(--color-text-primary)]">
                                        {item.label}
                                    </span>
                                    <ChevronRight className="h-5 w-5 text-[var(--color-text-secondary)]" />
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={() => void logout()}
                        className="mt-6 flex min-h-14 w-full items-center gap-4 rounded-[12px] border border-[var(--color-danger)]/50 bg-[var(--color-danger)]/10 px-4 text-left text-[var(--color-danger)] transition hover:bg-[var(--color-danger)]/15"
                    >
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--color-danger)]/10">
                            <LogOut className="h-5 w-5" />
                        </span>
                        <span className="text-base font-semibold">Sair</span>
                    </button>
                </section>
            )}

            <nav
                aria-label="Navegação principal"
                className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
                style={{ fontFamily: 'var(--font-body)' }}
            >
                <div className="relative mx-auto w-full max-w-[600px]">
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
