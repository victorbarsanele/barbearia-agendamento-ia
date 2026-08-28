import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Scissors, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function validateUsername(value: string): string | null {
    if (!value.trim()) {
        return 'O usuário é obrigatório.';
    }

    if (!/^[a-zA-Z0-9]+$/.test(value)) {
        return 'O usuário deve conter apenas letras e números.';
    }

    return null;
}

function validatePassword(value: string): string | null {
    if (!value) {
        return 'A senha é obrigatória.';
    }

    if (value.length < 8) {
        return 'A senha deve ter no mínimo 8 caracteres.';
    }

    const hasLetters = /[a-zA-Z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSymbol = /[^a-zA-Z0-9]/.test(value);

    if (!hasLetters || !hasNumbers || !hasSymbol) {
        return 'A senha deve conter letras, números e ao menos um símbolo.';
    }

    return null;
}

export function LoginPage() {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading, login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const usernameError = useMemo(() => validateUsername(username), [username]);
    const passwordError = useMemo(() => validatePassword(password), [password]);

    useEffect(() => {
        if (!isLoading && isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, isLoading, navigate]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);

        if (usernameError || passwordError) {
            setErrorMessage(usernameError ?? passwordError);
            return;
        }

        setIsSubmitting(true);

        try {
            await login(username.trim(), password);
            navigate('/', { replace: true });
        } catch {
            setErrorMessage('Usuário ou senha incorretos');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(201,168,76,0.16),_transparent_55%),_linear-gradient(180deg,_#0a0a0a_0%,_#0a0a0a_100%)] px-4 py-10">
            <div className="mb-10 flex flex-col items-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-gold)]">
                    <Scissors
                        className="h-9 w-9 text-[var(--color-gold)]"
                        strokeWidth={1.5}
                    />
                </div>
                <h1
                    className="mt-5 text-2xl tracking-[0.3em] text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    BARBEARIA
                </h1>
            </div>

            <section className="w-full max-w-sm rounded-[24px] border border-white/5 bg-[var(--color-surface-elevated)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-8">
                <form className="space-y-5" onSubmit={handleSubmit} noValidate>
                    <div className="space-y-2">
                        <label
                            htmlFor="username"
                            className="text-xs font-medium tracking-wider text-[var(--color-text-secondary)]"
                        >
                            USUÁRIO
                        </label>
                        <div className="relative">
                            <User
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-gold)]"
                                strokeWidth={1.5}
                            />
                            <input
                                id="username"
                                type="text"
                                autoComplete="username"
                                value={username}
                                onChange={(event) =>
                                    setUsername(event.target.value)
                                }
                                className="h-12 w-full rounded-[12px] border border-[var(--color-gold)]/50 bg-transparent pl-10 pr-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]"
                                placeholder="seu usuário"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label
                            htmlFor="password"
                            className="text-xs font-medium tracking-wider text-[var(--color-text-secondary)]"
                        >
                            SENHA
                        </label>
                        <div className="relative">
                            <Lock
                                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-secondary)]"
                                strokeWidth={1.5}
                            />
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) =>
                                    setPassword(event.target.value)
                                }
                                className="h-12 w-full rounded-[12px] border border-[var(--color-border)] bg-transparent pl-10 pr-10 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]"
                                placeholder="sua senha"
                            />
                            <button
                                type="button"
                                onClick={() =>
                                    setShowPassword((value) => !value)
                                }
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                                aria-label={
                                    showPassword
                                        ? 'Ocultar senha'
                                        : 'Mostrar senha'
                                }
                            >
                                {showPassword ? (
                                    <EyeOff
                                        className="h-4 w-4"
                                        strokeWidth={1.5}
                                    />
                                ) : (
                                    <Eye
                                        className="h-4 w-4"
                                        strokeWidth={1.5}
                                    />
                                )}
                            </button>
                        </div>
                    </div>

                    {errorMessage && (
                        <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[#fca5a5]">
                            {errorMessage}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="mt-1 h-12 w-full rounded-[12px] bg-[linear-gradient(90deg,_var(--color-gold-light)_0%,_#a97c2f_100%)] text-sm font-bold text-[#2a1a05] transition disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isSubmitting ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>
            </section>
        </main>
    );
}
