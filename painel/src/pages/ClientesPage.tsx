import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Package, Pencil, Trash2 } from 'lucide-react';
import { AgendamentosClienteModal } from '../components/AgendamentosClienteModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PacoteClienteModal } from '../components/PacoteClienteModal';
import { SkeletonCard } from '../components/SkeletonCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { listarAgendamentos } from '../services/agendamentos.service';
import {
    excluirCliente,
    listarClientesPaginado,
    obterResumoExclusaoCliente,
    type Cliente,
    type ResumoExclusaoCliente,
} from '../services/clientes.service';
import { formatarTelefone } from '../utils/formatarTelefone';
import { nomeConfereComConfirmacao } from '../utils/nomeConfereComConfirmacao';

const CLIENTES_POR_PAGINA = 10;
const DEBOUNCE_BUSCA_MS = 350;

function getMensagemErro(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Nao foi possivel processar a exclusao do cliente.';
}

export function ClientesPage() {
    const navigate = useNavigate();

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);
    const [clientePendenteExclusao, setClientePendenteExclusao] =
        useState<Cliente | null>(null);
    const [resumoExclusao, setResumoExclusao] =
        useState<ResumoExclusaoCliente | null>(null);
    const [nomeConfirmacao, setNomeConfirmacao] = useState('');
    const [carregandoResumoId, setCarregandoResumoId] = useState<string | null>(
        null,
    );
    const [agendamentosPorCliente, setAgendamentosPorCliente] = useState<
        Record<string, number>
    >({});
    const [clienteModalAgendamentos, setClienteModalAgendamentos] =
        useState<Cliente | null>(null);
    const [clienteModalPacote, setClienteModalPacote] =
        useState<Cliente | null>(null);
    const [busca, setBusca] = useState('');
    const [buscaDebounced, setBuscaDebounced] = useState('');
    const [pagina, setPagina] = useState(1);
    const [totalPaginas, setTotalPaginas] = useState(1);
    const [totalClientes, setTotalClientes] = useState(0);
    const [refreshToken, setRefreshToken] = useState(0);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setBuscaDebounced(busca.trim());
            setPagina(1);
        }, DEBOUNCE_BUSCA_MS);

        return () => window.clearTimeout(timer);
    }, [busca]);

    useEffect(() => {
        let ativo = true;

        const carregarClientes = async () => {
            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const [clientesResponse, agendamentosResponse] =
                    await Promise.all([
                        listarClientesPaginado({
                            search: buscaDebounced || undefined,
                            page: pagina,
                            limit: CLIENTES_POR_PAGINA,
                        }),
                        listarAgendamentos(),
                    ]);
                if (!ativo) {
                    return;
                }

                const quantidadePorCliente = agendamentosResponse.reduce<
                    Record<string, number>
                >((acc, agendamento) => {
                    const clienteId = agendamento.cliente.id;
                    acc[clienteId] = (acc[clienteId] ?? 0) + 1;
                    return acc;
                }, {});

                setClientes(clientesResponse.data);
                setTotalPaginas(clientesResponse.totalPages);
                setTotalClientes(clientesResponse.total);
                setAgendamentosPorCliente(quantidadePorCliente);
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Nao foi possivel carregar os clientes.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarClientes();

        return () => {
            ativo = false;
        };
    }, [buscaDebounced, pagina, refreshToken]);

    const handleSolicitarExclusao = async (cliente: Cliente) => {
        setCarregandoResumoId(cliente.id);
        setErro(null);
        setSucesso(null);

        try {
            const resumo = await obterResumoExclusaoCliente(cliente.id);
            setClientePendenteExclusao(cliente);
            setNomeConfirmacao('');

            if (resumo.impedimentos.length > 0 || resumo.temHistorico) {
                setResumoExclusao(resumo);
            } else {
                setResumoExclusao(null);
            }
        } catch (error) {
            setErro(getMensagemErro(error));
        } finally {
            setCarregandoResumoId(null);
        }
    };

    const fecharExclusao = () => {
        if (excluindoId) {
            return;
        }

        setClientePendenteExclusao(null);
        setResumoExclusao(null);
        setNomeConfirmacao('');
    };

    const handleConfirmarExclusao = async () => {
        if (!clientePendenteExclusao) {
            return;
        }

        setExcluindoId(clientePendenteExclusao.id);
        setErro(null);
        setSucesso(null);

        try {
            await excluirCliente(clientePendenteExclusao.id, {
                confirmarHistorico: Boolean(resumoExclusao?.temHistorico),
            });
            const eraUltimoDaPagina = clientes.length === 1 && pagina > 1;
            if (eraUltimoDaPagina) {
                setPagina((atual) => atual - 1);
            } else {
                setRefreshToken((atual) => atual + 1);
            }
            setSucesso('Cliente excluido com sucesso.');
        } catch (error) {
            setErro(getMensagemErro(error));
            setSucesso(null);
        } finally {
            setExcluindoId(null);
            setClientePendenteExclusao(null);
            setResumoExclusao(null);
            setNomeConfirmacao('');
        }
    };

    const handleRemocaoAgendamentoNoModal = (clienteId: string) => {
        setAgendamentosPorCliente((current) => {
            const atual = current[clienteId] ?? 0;
            const proximo = Math.max(0, atual - 1);

            return {
                ...current,
                [clienteId]: proximo,
            };
        });
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 pb-20 sm:p-6 sm:pb-24">
            <PageHeader
                variant="list"
                title="Clientes"
                subtitle="Gerencie os clientes cadastrados."
                action={
                    <Button
                        variant="primary"
                        className="px-3 text-xs"
                        onClick={() => navigate('/clientes/novo')}
                    >
                        Novo cliente
                    </Button>
                }
            />

            <div className="mb-4">
                <input
                    type="text"
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Buscar por nome ou telefone..."
                    aria-label="Buscar clientes"
                    className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]"
                />
            </div>

            {loading && <SkeletonCard count={4} variant="cliente" />}

            {erro && (
                <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]">
                    {erro}
                </div>
            )}

            {sucesso && (
                <div className="mb-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-4 text-sm text-[var(--color-success)]">
                    {sucesso}
                </div>
            )}

            {!loading && !erro && clientes.length === 0 && (
                <Card>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        {buscaDebounced
                            ? 'Nenhum cliente encontrado para essa busca.'
                            : 'Nenhum cliente cadastrado ainda.'}
                    </p>
                </Card>
            )}

            {!loading && !erro && clientes.length > 0 && (
                <div className="space-y-3">
                    {clientes.map((cliente) => (
                        <Card
                            key={cliente.id}
                            className="flex flex-col gap-3 bg-[var(--color-surface-elevated)]"
                        >
                            <div>
                                <p className="text-base font-bold text-[var(--color-text-primary)]">
                                    {cliente.nome}
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    {formatarTelefone(cliente.telefone)}
                                </p>
                            </div>

                            <div className="grid w-full grid-cols-4 gap-1 sm:ml-auto sm:flex sm:w-auto">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        setClienteModalAgendamentos(cliente)
                                    }
                                    title={`Ver agendamentos (${agendamentosPorCliente[cliente.id] ?? 0})`}
                                    aria-label={`Ver agendamentos (${agendamentosPorCliente[cliente.id] ?? 0})`}
                                    className="relative h-auto min-h-14 w-full flex-col gap-0.5 px-0 py-1 text-xs leading-tight sm:w-14"
                                >
                                    <Calendar size={16} aria-hidden="true" />
                                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-gold)] px-1 text-xs font-bold leading-none text-[var(--color-on-gold)]">
                                        {agendamentosPorCliente[cliente.id] ??
                                            0}
                                    </span>
                                    <span>Agenda</span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        setClienteModalPacote(cliente)
                                    }
                                    title="Gerenciar pacote do cliente"
                                    aria-label="Gerenciar pacote do cliente"
                                    className="h-auto min-h-14 w-full flex-col gap-0.5 px-0 py-1 text-xs leading-tight sm:w-14"
                                >
                                    <Package size={16} aria-hidden="true" />
                                    <span>Pacote</span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        navigate(
                                            `/clientes/editar/${cliente.id}`,
                                        )
                                    }
                                    title="Editar cliente"
                                    aria-label="Editar cliente"
                                    className="h-auto min-h-14 w-full flex-col gap-0.5 px-0 py-1 text-xs leading-tight sm:w-14"
                                >
                                    <Pencil size={16} aria-hidden="true" />
                                    <span>Editar</span>
                                </Button>
                                <Button
                                    type="button"
                                    variant="danger-soft"
                                    onClick={() =>
                                        void handleSolicitarExclusao(cliente)
                                    }
                                    disabled={
                                        excluindoId === cliente.id ||
                                        carregandoResumoId === cliente.id
                                    }
                                    title="Excluir cliente"
                                    aria-label="Excluir cliente"
                                    className="h-auto min-h-14 w-full flex-col gap-0.5 px-0 py-1 text-xs leading-tight sm:w-14"
                                >
                                    <Trash2 size={16} aria-hidden="true" />
                                    <span>Excluir</span>
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {!loading && !erro && totalClientes > 0 && (
                <div className="mt-4 flex items-center justify-between gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        className="px-3 text-xs"
                        disabled={pagina <= 1}
                        onClick={() =>
                            setPagina((atual) => Math.max(1, atual - 1))
                        }
                    >
                        Anterior
                    </Button>

                    <p className="text-xs text-[var(--color-text-secondary)]">
                        Pagina {pagina} de {totalPaginas} ({totalClientes}{' '}
                        {totalClientes === 1 ? 'cliente' : 'clientes'})
                    </p>

                    <Button
                        type="button"
                        variant="ghost"
                        className="px-3 text-xs"
                        disabled={pagina >= totalPaginas}
                        onClick={() =>
                            setPagina((atual) =>
                                Math.min(totalPaginas, atual + 1),
                            )
                        }
                    >
                        Próximo
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={
                    Boolean(clientePendenteExclusao) && resumoExclusao === null
                }
                title="Confirmar exclusão"
                description={
                    clientePendenteExclusao
                        ? `Deseja excluir o cliente ${clientePendenteExclusao.nome}?`
                        : ''
                }
                confirmText="Excluir"
                loading={Boolean(excluindoId)}
                onCancel={() => {
                    fecharExclusao();
                }}
                onConfirm={() => {
                    void handleConfirmarExclusao();
                }}
            />

            {clientePendenteExclusao && resumoExclusao && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 p-4 backdrop-blur-[1px]"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Resumo da exclusão do cliente"
                >
                    <Card className="w-full max-w-md p-5 shadow-xl">
                        <h2
                            className="text-lg font-semibold text-[var(--color-gold)]"
                            style={{ fontFamily: 'var(--font-title)' }}
                        >
                            {resumoExclusao.impedimentos.length > 0
                                ? 'Exclusão bloqueada'
                                : 'Excluir histórico do cliente'}
                        </h2>

                        {resumoExclusao.impedimentos.length > 0 ? (
                            <>
                                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                                    Resolva estes impedimentos antes de excluir:
                                </p>
                                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-danger-text)]">
                                    {resumoExclusao.impedimentos.map(
                                        (impedimento) => (
                                            <li key={impedimento}>
                                                {impedimento}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </>
                        ) : (
                            <>
                                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                                    Esta exclusão não pode ser desfeita.
                                </p>
                                <div className="mt-3 space-y-1 text-sm text-[var(--color-text-secondary)]">
                                    <p>
                                        {resumoExclusao.agendamentos.concluidos}{' '}
                                        atendimentos concluídos
                                    </p>
                                    <p>
                                        {resumoExclusao.agendamentos.passados}{' '}
                                        atendimentos passados
                                    </p>
                                    <p>
                                        {resumoExclusao.agendamentos.cancelados}{' '}
                                        atendimentos cancelados
                                    </p>
                                    <p>
                                        {resumoExclusao.pacotes.finalizados +
                                            resumoExclusao.pacotes
                                                .cancelados}{' '}
                                        pacotes
                                    </p>
                                    <p>{resumoExclusao.lotes} lotes</p>
                                </div>
                                <label className="mt-4 block text-sm text-[var(--color-text-primary)]">
                                    Digite o nome do cliente para confirmar
                                    <input
                                        type="text"
                                        value={nomeConfirmacao}
                                        onChange={(event) =>
                                            setNomeConfirmacao(
                                                event.target.value,
                                            )
                                        }
                                        className="mt-2 h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm outline-none focus:border-[var(--color-gold)]"
                                    />
                                </label>
                            </>
                        )}

                        <div className="mt-5 flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="danger"
                                onClick={fecharExclusao}
                                disabled={Boolean(excluindoId)}
                                className="px-3 text-sm"
                            >
                                Cancelar
                            </Button>
                            {resumoExclusao.impedimentos.length === 0 && (
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() =>
                                        void handleConfirmarExclusao()
                                    }
                                    disabled={
                                        Boolean(excluindoId) ||
                                        !nomeConfereComConfirmacao(
                                            nomeConfirmacao,
                                            clientePendenteExclusao.nome,
                                        )
                                    }
                                    className="px-3 text-sm"
                                >
                                    {excluindoId ? 'Excluindo...' : 'Excluir'}
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            <AgendamentosClienteModal
                open={Boolean(clienteModalAgendamentos)}
                cliente={clienteModalAgendamentos}
                onClose={() => setClienteModalAgendamentos(null)}
                onRemoverAgendamento={handleRemocaoAgendamentoNoModal}
            />

            <PacoteClienteModal
                open={Boolean(clienteModalPacote)}
                cliente={clienteModalPacote}
                onClose={() => setClienteModalPacote(null)}
            />
        </main>
    );
}
