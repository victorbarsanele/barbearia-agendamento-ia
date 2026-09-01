import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ServicosMultiSelect } from '../components/ServicosMultiSelect';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    atualizarPacote,
    buscarPacotePorId,
    type Pacote,
    type PacotePayload,
} from '../services/pacotes.service';
import { listarServicos, type Servico } from '../services/servicos.service';

function buildPayload(
    nome: string,
    quantidade: string,
    duracaoDias: string,
    servicoIds: string[],
): PacotePayload {
    return {
        nome: nome.trim(),
        quantidade: Number(quantidade),
        duracaoDias: Number(duracaoDias),
        servicoIds,
    };
}

export function EditarPacotePage() {
    const navigate = useNavigate();
    const { id = '' } = useParams<{ id: string }>();

    const [pacote, setPacote] = useState<Pacote | null>(null);
    const [nome, setNome] = useState('');
    const [quantidade, setQuantidade] = useState('');
    const [duracaoDias, setDuracaoDias] = useState('');
    const [servicoIds, setServicoIds] = useState<string[]>([]);

    const [servicos, setServicos] = useState<Servico[]>([]);
    const [carregandoServicos, setCarregandoServicos] = useState(true);

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

        const carregarServicos = async () => {
            setCarregandoServicos(true);

            try {
                const response = await listarServicos();
                if (!ativo) {
                    return;
                }

                setServicos(response);
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os serviços.';
                setErro(message);
            } finally {
                if (ativo) {
                    setCarregandoServicos(false);
                }
            }
        };

        void carregarServicos();

        return () => {
            ativo = false;
        };
    }, []);

    useEffect(() => {
        let ativo = true;

        const carregarPacote = async () => {
            if (!id) {
                if (ativo) {
                    setErro('ID do pacote inválido.');
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const response = await buscarPacotePorId(id);
                if (!ativo) {
                    return;
                }

                setPacote(response);
                setNome(response.nome);
                setQuantidade(String(response.quantidade));
                setDuracaoDias(String(response.duracaoDias));
                setServicoIds(response.servicos.map((item) => item.servicoId));
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os dados do pacote.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarPacote();

        return () => {
            ativo = false;
        };
    }, [id]);

    const podeSalvar = useMemo(() => {
        return (
            !!pacote &&
            !!nome.trim() &&
            !!quantidade.trim() &&
            !!duracaoDias.trim() &&
            servicoIds.length > 0 &&
            !submetendo
        );
    }, [pacote, nome, quantidade, duracaoDias, servicoIds, submetendo]);

    const handleToggleServico = (servicoId: string) => {
        setServicoIds((current) =>
            current.includes(servicoId)
                ? current.filter((itemId) => itemId !== servicoId)
                : [...current, servicoId],
        );
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!id || !pacote) {
            setErro('Pacote inválido para edição.');
            return;
        }

        const quantidadeNumero = Number(quantidade);
        const duracaoDiasNumero = Number(duracaoDias);

        if (!nome.trim() || !quantidade.trim() || !duracaoDias.trim()) {
            setErro('Nome, quantidade e duração são obrigatórios.');
            return;
        }

        if (!Number.isInteger(quantidadeNumero) || quantidadeNumero <= 0) {
            setErro('Quantidade deve ser um número inteiro maior que zero.');
            return;
        }

        if (!Number.isInteger(duracaoDiasNumero) || duracaoDiasNumero <= 0) {
            setErro('Duração deve ser um número inteiro maior que zero.');
            return;
        }

        if (servicoIds.length === 0) {
            setErro('Selecione ao menos um serviço.');
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);

        try {
            await atualizarPacote(
                id,
                buildPayload(nome, quantidade, duracaoDias, servicoIds),
            );
            setSucesso('Pacote atualizado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/pacotes');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível atualizar o pacote.';
            setErro(message);
            setSucesso(null);
        } finally {
            setSubmetendo(false);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 sm:p-6">
            <header className="mb-6 flex items-center gap-3">
                <Button variant="ghost" onClick={() => navigate('/pacotes')}>
                    Voltar
                </Button>
                <h1
                    className="text-3xl font-bold text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    Editar pacote
                </h1>
            </header>

            {loading && (
                <Card className="bg-[var(--color-surface-elevated)]">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Carregando dados do pacote...
                    </p>
                </Card>
            )}

            {!loading && (
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
                                onChange={(event) =>
                                    setNome(event.target.value)
                                }
                                placeholder="Nome do pacote"
                                className={fieldClassName}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="quantidade"
                                className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                            >
                                Quantidade *
                            </label>
                            <input
                                id="quantidade"
                                type="number"
                                min={1}
                                step={1}
                                value={quantidade}
                                onChange={(event) =>
                                    setQuantidade(event.target.value)
                                }
                                placeholder="Ex: 4"
                                className={fieldClassName}
                            />
                        </div>

                        <div>
                            <label
                                htmlFor="duracaoDias"
                                className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                            >
                                Duração (dias) *
                            </label>
                            <input
                                id="duracaoDias"
                                type="number"
                                min={1}
                                step={1}
                                value={duracaoDias}
                                onChange={(event) =>
                                    setDuracaoDias(event.target.value)
                                }
                                placeholder="Ex: 30"
                                className={fieldClassName}
                            />
                        </div>

                        <div>
                            <span className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                                Serviços inclusos *
                            </span>
                            {carregandoServicos ? (
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Carregando serviços...
                                </p>
                            ) : (
                                <ServicosMultiSelect
                                    servicos={servicos}
                                    selecionados={servicoIds}
                                    onToggle={handleToggleServico}
                                    disabled={submetendo}
                                />
                            )}
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
                            {submetendo ? 'Salvando...' : 'Salvar alterações'}
                        </Button>
                    </form>
                </Card>
            )}
        </main>
    );
}
