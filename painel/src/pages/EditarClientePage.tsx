import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    atualizarCliente,
    buscarClientePorId,
    type Cliente,
    type ClientePayload,
} from '../services/clientes.service';

function buildPayload(nome: string, telefone: string): ClientePayload {
    return {
        nome: nome.trim(),
        telefone: telefone.trim(),
    };
}

export function EditarClientePage() {
    const navigate = useNavigate();
    const { id = '' } = useParams<{ id: string }>();

    const [cliente, setCliente] = useState<Cliente | null>(null);
    const [nome, setNome] = useState('');
    const [telefone, setTelefone] = useState('');

    const [loading, setLoading] = useState(true);
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

    useEffect(() => {
        let ativo = true;

        const carregarCliente = async () => {
            if (!id) {
                if (ativo) {
                    setErro('ID do cliente invalido.');
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const response = await buscarClientePorId(id);
                if (!ativo) {
                    return;
                }

                setCliente(response);
                setNome(response.nome);
                setTelefone(response.telefone);
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Nao foi possivel carregar os dados do cliente.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarCliente();

        return () => {
            ativo = false;
        };
    }, [id]);

    const podeSalvar = useMemo(() => {
        return !!cliente && !!nome.trim() && !!telefone.trim() && !submetendo;
    }, [cliente, nome, telefone, submetendo]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!id || !cliente) {
            setErro('Cliente invalido para edicao.');
            return;
        }

        if (!nome.trim() || !telefone.trim()) {
            setErro('Nome e telefone sao obrigatorios.');
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);

        try {
            await atualizarCliente(id, buildPayload(nome, telefone));
            setSucesso('Cliente atualizado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/clientes');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Nao foi possivel atualizar o cliente.';
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
                    Editar cliente
                </h1>
            </header>

            {loading && (
                <Card className="bg-[var(--color-surface-elevated)]">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Carregando cliente...
                    </p>
                </Card>
            )}

            {!loading && (
                <Card>
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
                                onChange={(event) =>
                                    setNome(event.target.value)
                                }
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
                            {submetendo ? 'Salvando...' : 'Salvar alteracoes'}
                        </Button>
                    </form>
                </Card>
            )}
        </main>
    );
}
