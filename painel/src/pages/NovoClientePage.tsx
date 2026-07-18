import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    criarCliente,
    type ClientePayload,
} from '../services/clientes.service';

function buildPayload(nome: string, telefone: string): ClientePayload {
    return {
        nome: nome.trim(),
        telefone: telefone.trim(),
    };
}

export function NovoClientePage() {
    const navigate = useNavigate();

    const [nome, setNome] = useState('');
    const [telefone, setTelefone] = useState('');

    const [submetendo, setSubmetendo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const fieldClassName =
        'h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]';

    const redirectTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (redirectTimeoutRef.current !== null) {
                window.clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, []);

    const podeSalvar = useMemo(() => {
        return !!nome.trim() && !!telefone.trim() && !submetendo;
    }, [nome, telefone, submetendo]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!nome.trim() || !telefone.trim()) {
            setErro('Nome e telefone sao obrigatorios.');
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);

        try {
            await criarCliente(buildPayload(nome, telefone));
            setSucesso('Cliente cadastrado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/clientes');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Nao foi possivel cadastrar o cliente.';
            setErro(message);
            setSucesso(null);
        } finally {
            setSubmetendo(false);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 sm:p-6">
            <header className="mb-6 flex items-center gap-3">
                <Button variant="ghost" onClick={() => navigate('/clientes')}>
                    Voltar
                </Button>
                <h1
                    className="text-3xl font-bold text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    Novo cliente
                </h1>
            </header>

            <Card className="bg-[var(--color-surface-elevated)]">
                <form
                    onSubmit={(event) => {
                        void handleSubmit(event);
                    }}
                    className="space-y-5"
                >
                    <div>
                        <label
                            htmlFor="nome"
                            className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Nome *
                        </label>
                        <input
                            id="nome"
                            type="text"
                            value={nome}
                            onChange={(event) => setNome(event.target.value)}
                            placeholder="Nome do cliente"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="telefone"
                            className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Telefone *
                        </label>
                        <input
                            id="telefone"
                            type="text"
                            value={telefone}
                            onChange={(event) =>
                                setTelefone(event.target.value)
                            }
                            placeholder="(11) 99999-9999"
                            className={fieldClassName}
                        />
                    </div>

                    {erro && (
                        <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                            {erro}
                        </div>
                    )}

                    {sucesso && (
                        <div className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
                            {sucesso}
                        </div>
                    )}

                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={!podeSalvar}
                        className="min-h-12"
                    >
                        {submetendo ? 'Salvando...' : 'Salvar cliente'}
                    </Button>
                </form>
            </Card>
        </main>
    );
}
