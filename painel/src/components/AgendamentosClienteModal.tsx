import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Cliente } from '../services/clientes.service';
import {
    excluirAgendamento,
    listarAgendamentos,
    type Agendamento,
} from '../services/agendamentos.service';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

const TIME_ZONE = 'America/Sao_Paulo';

interface AgendamentosClienteModalProps {
    open: boolean;
    cliente: Cliente | null;
    onClose: () => void;
    onRemoverAgendamento: (clienteId: string) => void;
}

function formatarDataHoraEmBrasilia(isoDate: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(isoDate));
}

function getDateKeyEmBrasilia(isoDate: string): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(isoDate));
}

export function AgendamentosClienteModal({
    open,
    cliente,
    onClose,
    onRemoverAgendamento,
}: AgendamentosClienteModalProps) {
    const navigate = useNavigate();

    const [agendamentosCliente, setAgendamentosCliente] = useState<
        Agendamento[]
    >([]);
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [removendoId, setRemovendoId] = useState<string | null>(null);
    const [agoraReferencia, setAgoraReferencia] = useState(0);
    const [confirmandoRemocaoId, setConfirmandoRemocaoId] = useState<
        string | null
    >(null);

    useEffect(() => {
        if (!open || !cliente) {
            return;
        }

        let ativo = true;

        const carregarAgendamentosCliente = async () => {
            setLoading(true);
            setErro(null);
            setAgoraReferencia(Date.now());
            setConfirmandoRemocaoId(null);

            try {
                const lista = await listarAgendamentos();
                if (!ativo) {
                    return;
                }

                setAgendamentosCliente(
                    lista.filter((item) => item.cliente.id === cliente.id),
                );
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Nao foi possivel carregar os agendamentos.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarAgendamentosCliente();

        return () => {
            ativo = false;
        };
    }, [open, cliente]);

    const { proximos, historico } = useMemo(() => {
        const sorted = [...agendamentosCliente];
        const futuros = sorted
            .filter(
                (item) =>
                    new Date(item.dataHoraInicio).getTime() >= agoraReferencia,
            )
            .sort(
                (a, b) =>
                    new Date(a.dataHoraInicio).getTime() -
                    new Date(b.dataHoraInicio).getTime(),
            );

        const passados = sorted
            .filter(
                (item) =>
                    new Date(item.dataHoraInicio).getTime() < agoraReferencia,
            )
            .sort(
                (a, b) =>
                    new Date(b.dataHoraInicio).getTime() -
                    new Date(a.dataHoraInicio).getTime(),
            );

        return {
            proximos: futuros,
            historico: passados,
        };
    }, [agendamentosCliente, agoraReferencia]);

    const handleVerNoPainel = (agendamento: Agendamento) => {
        const dateKey = getDateKeyEmBrasilia(agendamento.dataHoraInicio);
        onClose();
        navigate(`/?data=${dateKey}`);
    };

    const handleEditar = (agendamentoId: string) => {
        onClose();
        navigate(`/editar/${agendamentoId}`);
    };

    const handleRemover = async (agendamentoId: string) => {
        if (!cliente) {
            return;
        }

        setRemovendoId(agendamentoId);
        setErro(null);

        try {
            await excluirAgendamento(agendamentoId);
            setAgendamentosCliente((current) =>
                current.filter((item) => item.id !== agendamentoId),
            );
            onRemoverAgendamento(cliente.id);
            setConfirmandoRemocaoId(null);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Nao foi possivel remover o agendamento.';
            setErro(message);
        } finally {
            setRemovendoId(null);
        }
    };

    if (!open || !cliente) {
        return null;
    }

    const renderSecao = (
        titulo: string,
        itens: Agendamento[],
        opaca = false,
    ) => {
        return (
            <section>
                <h3 className="mb-2 text-sm font-semibold text-[var(--color-gold)]">
                    {titulo}
                </h3>

                {itens.length === 0 && (
                    <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-3 text-sm text-[var(--color-text-secondary)]">
                        Nenhum agendamento encontrado.
                    </p>
                )}

                {itens.length > 0 && (
                    <ul className="space-y-2">
                        {itens.map((agendamento) => (
                            <li
                                key={agendamento.id}
                                className={`rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/30 p-3 ${opaca ? 'opacity-65' : ''}`}
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                            {formatarDataHoraEmBrasilia(
                                                agendamento.dataHoraInicio,
                                            )}
                                        </p>
                                        <p className="text-sm text-[var(--color-text-secondary)]">
                                            {agendamento.servico.nome}
                                        </p>
                                    </div>
                                    <Badge status={agendamento.status} />
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="min-h-8 px-3 text-xs"
                                        onClick={() =>
                                            handleVerNoPainel(agendamento)
                                        }
                                    >
                                        Ver no painel
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="min-h-8 px-3 text-xs"
                                        onClick={() =>
                                            handleEditar(agendamento.id)
                                        }
                                    >
                                        Editar
                                    </Button>
                                    {confirmandoRemocaoId === agendamento.id ? (
                                        <>
                                            <span className="self-center text-xs text-[var(--color-text-secondary)]">
                                                Tem certeza?
                                            </span>
                                            <Button
                                                type="button"
                                                variant="danger"
                                                className="min-h-8 px-3 text-xs"
                                                disabled={
                                                    removendoId ===
                                                    agendamento.id
                                                }
                                                onClick={() =>
                                                    void handleRemover(
                                                        agendamento.id,
                                                    )
                                                }
                                            >
                                                {removendoId === agendamento.id
                                                    ? 'Removendo...'
                                                    : 'Sim, remover'}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                className="min-h-8 px-3 text-xs"
                                                disabled={
                                                    removendoId ===
                                                    agendamento.id
                                                }
                                                onClick={() =>
                                                    setConfirmandoRemocaoId(
                                                        null,
                                                    )
                                                }
                                            >
                                                Cancelar
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="danger"
                                            className="min-h-8 px-3 text-xs"
                                            disabled={
                                                removendoId === agendamento.id
                                            }
                                            onClick={() =>
                                                setConfirmandoRemocaoId(
                                                    agendamento.id,
                                                )
                                            }
                                        >
                                            Remover
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Agendamentos de ${cliente.nome}`}
        >
            <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
                <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                    <h2
                        className="text-xl font-semibold text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        {cliente.nome}
                    </h2>
                    <Button
                        type="button"
                        variant="ghost"
                        className="min-h-8 w-8 px-0 text-base leading-none"
                        onClick={onClose}
                        aria-label="Fechar"
                    >
                        X
                    </Button>
                </header>

                <div className="max-h-[90vh] space-y-4 overflow-y-auto p-4">
                    {loading && (
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Carregando agendamentos...
                        </p>
                    )}

                    {erro && (
                        <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                            {erro}
                        </div>
                    )}

                    {!loading && (
                        <>
                            {renderSecao('Próximos', proximos)}
                            {renderSecao('Histórico', historico, true)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
