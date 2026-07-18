import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    atualizarServico,
    buscarServicoPorId,
    type Servico,
    type ServicoPayload,
} from '../services/servicos.service';
import {
    formatPrecoNumberToInputBR,
    normalizePrecoInputBR,
    parsePrecoInputBR,
} from '../utils/preco';

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

export function EditarServicoPage() {
    const navigate = useNavigate();
    const { id = '' } = useParams<{ id: string }>();

    const [servico, setServico] = useState<Servico | null>(null);
    const [nome, setNome] = useState('');
    const [duracaoMinutos, setDuracaoMinutos] = useState('');
    const [preco, setPreco] = useState('');

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

        const carregarServico = async () => {
            if (!id) {
                if (ativo) {
                    setErro('ID do servico invalido.');
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const response = await buscarServicoPorId(id);
                if (!ativo) {
                    return;
                }

                setServico(response);
                setNome(response.nome);
                setDuracaoMinutos(String(response.duracaoMinutos));
                setPreco(formatPrecoNumberToInputBR(response.preco));
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Nao foi possivel carregar os dados do servico.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarServico();

        return () => {
            ativo = false;
        };
    }, [id]);

    const podeSalvar = useMemo(() => {
        return (
            !!servico && !!nome.trim() && !!duracaoMinutos.trim() && !submetendo
        );
    }, [servico, nome, duracaoMinutos, submetendo]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!id || !servico) {
            setErro('Servico invalido para edicao.');
            return;
        }

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
            await atualizarServico(
                id,
                buildPayload(nome, duracaoMinutos, precoNumero),
            );
            setSucesso('Servico atualizado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/servicos');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Nao foi possivel atualizar o servico.';
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
                    Editar servico
                </h1>
            </header>

            {loading && (
                <Card className="bg-[var(--color-surface-elevated)]">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Carregando servico...
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
                                        normalizePrecoInputBR(
                                            event.target.value,
                                        ),
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
                            {submetendo ? 'Salvando...' : 'Salvar alteracoes'}
                        </Button>
                    </form>
                </Card>
            )}
        </main>
    );
}
