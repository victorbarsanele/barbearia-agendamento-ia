import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    criarServico,
    type ServicoPayload,
} from '../services/servicos.service';
import { normalizePrecoInputBR, parsePrecoInputBR } from '../utils/preco';

function buildPayload(
    nome: string,
    duracaoMinutos: string,
    precoNumero: number | undefined,
): ServicoPayload {
    return {
        nome: nome.trim(),
        duracaoMinutos: Number(duracaoMinutos),
        preco: precoNumero ?? null,
    };
}

export function NovoServicoPage() {
    const navigate = useNavigate();

    const [nome, setNome] = useState('');
    const [duracaoMinutos, setDuracaoMinutos] = useState('');
    const [preco, setPreco] = useState('');

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
        return !!nome.trim() && !!duracaoMinutos.trim() && !submetendo;
    }, [nome, duracaoMinutos, submetendo]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const duracaoNumero = Number(duracaoMinutos);
        const precoNumero = parsePrecoInputBR(preco);

        if (!nome.trim() || !duracaoMinutos.trim()) {
            setErro('Nome e duracao sao obrigatorios.');
            return;
        }

        if (!Number.isInteger(duracaoNumero) || duracaoNumero <= 0) {
            setErro('Duracao deve ser um numero inteiro maior que zero.');
            return;
        }

        if (
            precoNumero !== undefined &&
            (!Number.isFinite(precoNumero) || precoNumero < 0)
        ) {
            setErro('Preco deve ser um numero maior ou igual a zero.');
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);

        try {
            await criarServico(buildPayload(nome, duracaoMinutos, precoNumero));
            setSucesso('Servico cadastrado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/servicos');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Nao foi possivel cadastrar o servico.';
            setErro(message);
            setSucesso(null);
        } finally {
            setSubmetendo(false);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 sm:p-6">
            <header className="mb-6 flex items-center gap-3">
                <Button variant="ghost" onClick={() => navigate('/servicos')}>
                    Voltar
                </Button>
                <h1
                    className="text-3xl font-bold text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    Novo servico
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
                            placeholder="Nome do servico"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="duracaoMinutos"
                            className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Duracao (minutos) *
                        </label>
                        <input
                            id="duracaoMinutos"
                            type="number"
                            min={1}
                            step={1}
                            value={duracaoMinutos}
                            onChange={(event) =>
                                setDuracaoMinutos(event.target.value)
                            }
                            placeholder="Ex: 45"
                            className={fieldClassName}
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="preco"
                            className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Preco (opcional)
                        </label>
                        <input
                            id="preco"
                            type="text"
                            inputMode="decimal"
                            value={preco}
                            onChange={(event) =>
                                setPreco(
                                    normalizePrecoInputBR(event.target.value),
                                )
                            }
                            placeholder="Ex: 79,90"
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
                        {submetendo ? 'Salvando...' : 'Salvar servico'}
                    </Button>
                </form>
            </Card>
        </main>
    );
}
