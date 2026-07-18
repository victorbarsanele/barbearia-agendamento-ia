import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';

interface LoginResponse {
    token: string;
}

function validateUsername(value: string): string | null {
    if (!value.trim()) {
        return 'Usuario e obrigatorio.';
    }

    if (!/^[a-zA-Z0-9]+$/.test(value)) {
        return 'Usuario deve conter apenas letras e numeros.';
    }

    return null;
}

function validatePassword(value: string): string | null {
    if (!value) {
        return 'Senha e obrigatoria.';
    }

    if (value.length < 8) {
        return 'Senha deve ter no minimo 8 caracteres.';
    }

    const hasLetters = /[a-zA-Z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSymbol = /[^a-zA-Z0-9]/.test(value);

    if (!hasLetters || !hasNumbers || !hasSymbol) {
        return 'Senha deve conter letras, numeros e ao menos um simbolo.';
    }

    return null;
}

export function LoginPage() {
    const navigate = useNavigate();
    const { isAuthenticated, login } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const usernameError = useMemo(() => validateUsername(username), [username]);
    const passwordError = useMemo(() => validatePassword(password), [password]);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, navigate]);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setErrorMessage(null);

        if (usernameError || passwordError) {
            setErrorMessage(usernameError ?? passwordError);
            return;
        }

        setIsSubmitting(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username.trim(),
                    password,
                }),
            });

            if (!response.ok) {
                throw new Error('INVALID_CREDENTIALS');
            }

            const data = (await response.json()) as LoginResponse;
            login(data.token);
            navigate('/', { replace: true });
        } catch {
            setErrorMessage('Usuario ou senha incorretos');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(201,168,76,0.2),_transparent_55%),_linear-gradient(180deg,_#0b0b0b_0%,_#121212_100%)] px-4 py-8">
            <section className="w-full max-w-md rounded-[12px] bg-[var(--color-surface-elevated)] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-8">
                <header className="mb-6 text-center">
                    <h1
                        className="text-3xl font-bold text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Painel Barbearia
                    </h1>
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                        Entre para acessar os agendamentos
                    </p>
                </header>

                <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                    <div className="space-y-1">
                        <label
                            htmlFor="username"
                            className="text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Usuario
                        </label>
                        <input
                            id="username"
                            type="text"
                            autoComplete="username"
                            value={username}
                            onChange={(event) =>
                                setUsername(event.target.value)
                            }
                            className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]"
                            placeholder="Seu usuario"
                        />
                    </div>

                    <div className="space-y-1">
                        <label
                            htmlFor="password"
                            className="text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Senha
                        </label>
                        <input
                            id="password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]"
                            placeholder="Sua senha"
                        />
                    </div>

                    {errorMessage && (
                        <p className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[#fca5a5]">
                            {errorMessage}
                        </p>
                    )}

                    <Button
                        type="submit"
                        fullWidth
                        disabled={isSubmitting}
                        className="mt-1 min-h-12"
                    >
                        {isSubmitting ? 'Entrando...' : 'Entrar'}
                    </Button>
                </form>
            </section>
        </main>
    );
}
