import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
    CalendarDays,
    CheckCircle2,
    CircleX,
    Package,
    Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonCard } from '../components/SkeletonCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { ApiError } from '../services/agendamentos.service';
import {
    arquivarPacote,
    desarquivarPacote,
    excluirPacote,
    listarPacotes,
    type PacoteCatalogo,
} from '../services/pacotes.service';
import { formatPrecoNumberToInputBR } from '../utils/preco';

type AbaPacotes = 'ativos' | 'arquivados';

function textoCiclosAtivos(quantidade: number): string {
    return `${quantidade} ${quantidade === 1 ? 'ciclo ativo' : 'ciclos ativos'}`;
}

function textoCiclosSeguem(quantidade: number): string {
    return `${quantidade} ${quantidade === 1 ? 'ciclo ativo seguirá' : 'ciclos ativos seguirão'} até zerar, sem renovação.`;
}

export function PacotesPage() {
    const navigate = useNavigate();

    const [pacotes, setPacotes] = useState<PacoteCatalogo[]>([]);
    const [abaAtiva, setAbaAtiva] = useState<AbaPacotes>('ativos');
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);
    const [mutacaoId, setMutacaoId] = useState<string | null>(null);
    const [pacotePendenteExclusao, setPacotePendenteExclusao] =
        useState<PacoteCatalogo | null>(null);
    const [pacotePendenteArquivamento, setPacotePendenteArquivamento] =
        useState<PacoteCatalogo | null>(null);
    const [pacoteParaArquivarDoErro, setPacoteParaArquivarDoErro] =
        useState<PacoteCatalogo | null>(null);
    const botoesAbas = useRef<Array<HTMLButtonElement | null>>([]);

    useEffect(() => {
        let ativo = true;

        const carregarPacotes = async () => {
            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const response = await listarPacotes('todos');
                if (!ativo) {
                    return;
                }

                setPacotes(response);
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os pacotes.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarPacotes();

        return () => {
            ativo = false;
        };
    }, []);

    const pacotesOrdenados = useMemo(() => {
        return [...pacotes].sort((a, b) => a.nome.localeCompare(b.nome));
    }, [pacotes]);

    const pacotesAtivos = pacotesOrdenados.filter(
        (pacote) => pacote.arquivadoEm === null,
    );
    const pacotesArquivados = pacotesOrdenados.filter(
        (pacote) => pacote.arquivadoEm !== null,
    );
    const pacotesVisiveis =
        abaAtiva === 'ativos' ? pacotesAtivos : pacotesArquivados;

    const recarregarPacotes = async () => {
        try {
            setPacotes(await listarPacotes('todos'));
        } catch {
            setErro(
                (atual) => atual ?? 'Não foi possível carregar os pacotes.',
            );
        }
    };

    const selecionarAba = (aba: AbaPacotes) => {
        setAbaAtiva(aba);
    };

    const navegarAbas = (
        event: KeyboardEvent<HTMLButtonElement>,
        indiceAtual: number,
    ) => {
        let proximoIndice: number | null = null;
        if (event.key === 'ArrowRight') {
            proximoIndice = (indiceAtual + 1) % 2;
        } else if (event.key === 'ArrowLeft') {
            proximoIndice = (indiceAtual + 1) % 2;
        } else if (event.key === 'Home') {
            proximoIndice = 0;
        } else if (event.key === 'End') {
            proximoIndice = 1;
        }
        if (proximoIndice !== null) {
            event.preventDefault();
            botoesAbas.current[proximoIndice]?.focus();
            selecionarAba(proximoIndice === 0 ? 'ativos' : 'arquivados');
        }
    };

    const atualizarPacoteLocal = (atualizado: PacoteCatalogo) => {
        setPacotes((atuais) =>
            atuais.map((pacote) =>
                pacote.id === atualizado.id ? atualizado : pacote,
            ),
        );
    };

    const handleConfirmarArquivamento = async () => {
        if (!pacotePendenteArquivamento || mutacaoId) {
            return;
        }

        const pacote = pacotePendenteArquivamento;
        setMutacaoId(pacote.id);
        setErro(null);
        setSucesso(null);

        try {
            atualizarPacoteLocal(await arquivarPacote(pacote.id));
            setSucesso('Pacote arquivado.');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível arquivar o pacote.';
            if (error instanceof ApiError && error.status === 404) {
                setErro('O pacote não existe mais.');
                await recarregarPacotes();
            } else {
                setErro(message);
            }
        } finally {
            setMutacaoId(null);
            setPacotePendenteArquivamento(null);
            setPacoteParaArquivarDoErro(null);
        }
    };

    const handleDesarquivar = async (pacote: PacoteCatalogo) => {
        if (mutacaoId) {
            return;
        }

        setMutacaoId(pacote.id);
        setErro(null);
        setSucesso(null);

        try {
            atualizarPacoteLocal(await desarquivarPacote(pacote.id));
            setSucesso('Pacote desarquivado.');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível desarquivar o pacote.';
            if (error instanceof ApiError && error.status === 404) {
                setErro('O pacote não existe mais.');
                await recarregarPacotes();
            } else {
                setErro(message);
            }
        } finally {
            setMutacaoId(null);
        }
    };

    const handleConfirmarExclusao = async () => {
        if (!pacotePendenteExclusao || mutacaoId) {
            return;
        }

        const pacote = pacotePendenteExclusao;
        setMutacaoId(pacote.id);
        setErro(null);
        setSucesso(null);

        try {
            await excluirPacote(pacote.id);
            setPacotes((current) =>
                current.filter((item) => item.id !== pacote.id),
            );
            setSucesso('Pacote excluído com sucesso.');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível excluir o pacote.';

            if (error instanceof ApiError && error.status === 404) {
                await recarregarPacotes();
                setErro('O pacote não existe mais.');
            } else if (error instanceof ApiError && error.status === 409) {
                if (error.body?.code === 'PACOTE_COM_CICLO_ATIVO') {
                    setErro(
                        'Há clientes com ciclo ativo neste pacote. Arquive em vez de excluir.',
                    );
                    setPacoteParaArquivarDoErro(null);
                } else if (error.body?.code === 'PACOTE_COM_HISTORICO') {
                    setErro(
                        'O pacote tem histórico de vendas. Arquive em vez de excluir.',
                    );
                    setPacoteParaArquivarDoErro(
                        abaAtiva === 'ativos' ? pacote : null,
                    );
                } else {
                    setErro(message);
                    setPacoteParaArquivarDoErro(null);
                }
                await recarregarPacotes();
            } else {
                setErro(message);
                setPacoteParaArquivarDoErro(null);
            }
            setSucesso(null);
        } finally {
            setMutacaoId(null);
            setPacotePendenteExclusao(null);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 pb-20 sm:p-6 sm:pb-24">
            <PageHeader
                variant="list"
                title="Pacotes"
                subtitle="Gerencie os pacotes de serviços cadastrados."
                action={
                    <Button
                        variant="primary"
                        className="px-3 text-xs"
                        onClick={() => navigate('/pacotes/novo')}
                    >
                        Novo pacote
                    </Button>
                }
            />

            {loading && <SkeletonCard count={3} variant="pacote" />}

            {erro && (
                <div
                    role="alert"
                    className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]"
                >
                    <span>{erro}</span>
                    {pacoteParaArquivarDoErro && (
                        <Button
                            type="button"
                            variant="outline"
                            disabled={mutacaoId !== null}
                            aria-label={`Arquivar pacote ${pacoteParaArquivarDoErro.nome}`}
                            onClick={() => {
                                setErro(null);
                                setPacotePendenteArquivamento(
                                    pacoteParaArquivarDoErro,
                                );
                                setPacoteParaArquivarDoErro(null);
                            }}
                        >
                            Arquivar
                        </Button>
                    )}
                </div>
            )}

            {sucesso && (
                <div
                    aria-live="polite"
                    className="mb-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-4 text-sm text-[var(--color-success)]"
                >
                    {sucesso}
                </div>
            )}

            {!loading && !erro && pacotesOrdenados.length === 0 && (
                <Card>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Nenhum pacote cadastrado ainda.
                    </p>
                </Card>
            )}

            {!loading && !erro && pacotesOrdenados.length > 0 && (
                <>
                    <div
                        role="tablist"
                        aria-label="Situação dos pacotes"
                        className="mb-6 flex overflow-x-auto border-b border-[var(--color-border)]"
                    >
                        {[
                            {
                                id: 'ativos' as const,
                                label: `Ativos (${pacotesAtivos.length})`,
                            },
                            {
                                id: 'arquivados' as const,
                                label: `Arquivados (${pacotesArquivados.length})`,
                            },
                        ].map((aba, indice) => (
                            <button
                                key={aba.id}
                                ref={(element) => {
                                    botoesAbas.current[indice] = element;
                                }}
                                id={`pacotes-tab-${aba.id}`}
                                type="button"
                                role="tab"
                                aria-selected={abaAtiva === aba.id}
                                aria-controls="pacotes-tabpanel"
                                tabIndex={abaAtiva === aba.id ? 0 : -1}
                                onClick={() => selecionarAba(aba.id)}
                                onKeyDown={(event) =>
                                    navegarAbas(event, indice)
                                }
                                className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition sm:px-4 ${abaAtiva === aba.id ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                            >
                                {aba.label}
                            </button>
                        ))}
                    </div>

                    <div
                        id="pacotes-tabpanel"
                        role="tabpanel"
                        aria-labelledby={`pacotes-tab-${abaAtiva}`}
                        tabIndex={0}
                    >
                        {pacotesVisiveis.length === 0 ? (
                            <Card>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    {abaAtiva === 'ativos'
                                        ? 'Nenhum pacote ativo.'
                                        : 'Nenhum pacote arquivado.'}
                                </p>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {pacotesVisiveis.map((pacote) => (
                                    <Card
                                        key={pacote.id}
                                        className="flex flex-col gap-3 border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                                    >
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <p className="min-w-0 pr-14 text-xl font-bold leading-tight text-[var(--color-text-primary)]">
                                                    {pacote.nome}
                                                </p>
                                                <span className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-gold-muted)] text-[var(--color-gold)]">
                                                    <Package
                                                        size={23}
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                            </div>

                                            {pacote.arquivadoEm && (
                                                <span className="inline-flex w-fit items-center rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-gold-muted)] px-3 py-1 text-xs font-semibold text-[var(--color-gold)]">
                                                    Arquivado
                                                </span>
                                            )}

                                            {pacote.ciclosAtivos > 0 && (
                                                <p className="text-sm font-semibold text-[var(--color-text-secondary)]">
                                                    {textoCiclosAtivos(
                                                        pacote.ciclosAtivos,
                                                    )}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-3 text-base">
                                                <CalendarDays
                                                    size={14}
                                                    aria-hidden="true"
                                                    className="text-[var(--color-text-secondary)]"
                                                />
                                                <span className="text-[var(--color-text-secondary)]">
                                                    {pacote.duracaoDias} dias
                                                </span>
                                                <span
                                                    className="h-1 w-1 rounded-full bg-[var(--color-text-secondary)]"
                                                    aria-hidden="true"
                                                />
                                                <span className="text-xl font-bold text-[var(--color-gold)]">
                                                    R${' '}
                                                    {formatPrecoNumberToInputBR(
                                                        pacote.preco,
                                                    )}
                                                </span>
                                            </div>

                                            <div
                                                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${pacote.liberadoParaGemini ? 'bg-[var(--color-success-muted)] text-[var(--color-success)]' : 'bg-[color:rgba(255,255,255,0.04)] text-[var(--color-text-secondary)]'}`}
                                            >
                                                {pacote.liberadoParaGemini ? (
                                                    <CheckCircle2
                                                        size={14}
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    <CircleX
                                                        size={14}
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <span>
                                                    {pacote.liberadoParaGemini
                                                        ? 'Liberado para sugestão do Gemini'
                                                        : 'Não liberado para sugestão do Gemini'}
                                                </span>
                                            </div>
                                            {pacote.arquivadoEm &&
                                                pacote.liberadoParaGemini && (
                                                    <p className="text-xs text-[var(--color-text-secondary)]">
                                                        Não aparece para o
                                                        Gemini enquanto
                                                        arquivado.
                                                    </p>
                                                )}

                                            <div>
                                                <p className="text-sm font-bold uppercase text-[var(--color-text-secondary)]">
                                                    Consumo por serviço
                                                </p>
                                                <ul className="mt-2 flex flex-wrap gap-2">
                                                    {pacote.servicos.map(
                                                        (item) => (
                                                            <li
                                                                key={
                                                                    item.servicoId
                                                                }
                                                                className="rounded-full border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]"
                                                            >
                                                                {
                                                                    item.servico
                                                                        .nome
                                                                }{' '}
                                                                <strong className="font-bold text-[var(--color-text-primary)]">
                                                                    {
                                                                        item.quantidadeTotal
                                                                    }{' '}
                                                                    usos
                                                                </strong>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                        </div>

                                        <div
                                            className="border-t border-[var(--color-border)]"
                                            aria-hidden="true"
                                        />

                                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() =>
                                                    navigate(
                                                        `/pacotes/editar/${pacote.id}`,
                                                    )
                                                }
                                                className="px-4 text-sm"
                                                aria-label={`Editar pacote ${pacote.nome}`}
                                                disabled={mutacaoId !== null}
                                            >
                                                Editar
                                            </Button>
                                            {pacote.arquivadoEm ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    aria-label={`Desarquivar pacote ${pacote.nome}`}
                                                    disabled={
                                                        mutacaoId !== null
                                                    }
                                                    onClick={() => {
                                                        void handleDesarquivar(
                                                            pacote,
                                                        );
                                                    }}
                                                >
                                                    {mutacaoId === pacote.id
                                                        ? 'Desarquivando...'
                                                        : 'Desarquivar'}
                                                </Button>
                                            ) : (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    aria-label={`Arquivar pacote ${pacote.nome}`}
                                                    disabled={
                                                        mutacaoId !== null
                                                    }
                                                    onClick={() => {
                                                        setErro(null);
                                                        setSucesso(null);
                                                        setPacoteParaArquivarDoErro(
                                                            null,
                                                        );
                                                        setPacotePendenteArquivamento(
                                                            pacote,
                                                        );
                                                    }}
                                                >
                                                    Arquivar
                                                </Button>
                                            )}
                                            {pacote.ciclosAtivos === 0 && (
                                                <IconButton
                                                    variant="danger"
                                                    ariaLabel={`Excluir pacote ${pacote.nome}`}
                                                    onClick={() => {
                                                        setErro(null);
                                                        setSucesso(null);
                                                        setPacotePendenteExclusao(
                                                            pacote,
                                                        );
                                                    }}
                                                    disabled={
                                                        mutacaoId !== null
                                                    }
                                                >
                                                    <Trash2
                                                        size={18}
                                                        aria-hidden="true"
                                                    />
                                                </IconButton>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            <ConfirmDialog
                open={Boolean(pacotePendenteExclusao)}
                title="Confirmar exclusão"
                description={
                    pacotePendenteExclusao
                        ? `Deseja excluir o pacote ${pacotePendenteExclusao.nome}?`
                        : ''
                }
                confirmText="Excluir"
                loading={mutacaoId === pacotePendenteExclusao?.id}
                onCancel={() => {
                    if (mutacaoId) {
                        return;
                    }
                    setPacotePendenteExclusao(null);
                }}
                onConfirm={() => {
                    void handleConfirmarExclusao();
                }}
            />

            <ConfirmDialog
                open={Boolean(pacotePendenteArquivamento)}
                title="Arquivar pacote?"
                description="O pacote deixa de aparecer para novas vendas, vínculos e para o Gemini. O histórico é preservado."
                descriptionItems={
                    pacotePendenteArquivamento &&
                    pacotePendenteArquivamento.ciclosAtivos > 0
                        ? [
                              textoCiclosSeguem(
                                  pacotePendenteArquivamento.ciclosAtivos,
                              ),
                          ]
                        : undefined
                }
                confirmText="Arquivar"
                loadingText="Arquivando..."
                confirmVariant="outline"
                cancelVariant="ghost"
                loading={mutacaoId === pacotePendenteArquivamento?.id}
                onCancel={() => {
                    if (!mutacaoId) {
                        setPacotePendenteArquivamento(null);
                        setPacoteParaArquivarDoErro(null);
                    }
                }}
                onConfirm={() => {
                    void handleConfirmarArquivamento();
                }}
            />
        </main>
    );
}
