import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgendamentosClienteModal } from '../components/AgendamentosClienteModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonCard } from '../components/SkeletonCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { listarAgendamentos } from '../services/agendamentos.service';
import {
    excluirCliente,
    listarClientes,
    type Cliente,
} from '../services/clientes.service';

function getMensagemErroExclusaoCliente(error: unknown): string {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    const pareceErroDeVinculo =
        message.includes('agendamento') ||
        message.includes('vinculad') ||
        message.includes('constraint') ||
        message.includes('foreign key');

    if (pareceErroDeVinculo) {
        return 'Este cliente possui agendamentos vinculados. Use o botao Agendamentos para remove-los antes de excluir.';
    }

    return 'Nao foi possivel excluir o cliente.';
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
    const [agendamentosPorCliente, setAgendamentosPorCliente] = useState<
        Record<string, number>
    >({});
    const [clienteModalAgendamentos, setClienteModalAgendamentos] =
        useState<Cliente | null>(null);

    useEffect(() => {
        let ativo = true;

        const carregarClientes = async () => {
            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const [clientesResponse, agendamentosResponse] =
                    await Promise.all([listarClientes(), listarAgendamentos()]);
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

                setClientes(clientesResponse);
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
    }, []);

    const handleConfirmarExclusao = async () => {
        if (!clientePendenteExclusao) {
            return;
        }

        setExcluindoId(clientePendenteExclusao.id);
        setErro(null);
        setSucesso(null);

        try {
            await excluirCliente(clientePendenteExclusao.id);
            setClientes((current) =>
                current.filter(
                    (item) => item.id !== clientePendenteExclusao.id,
                ),
            );
            setSucesso('Cliente excluido com sucesso.');
        } catch (error) {
            const message = getMensagemErroExclusaoCliente(error);
            setErro(message);
            setSucesso(null);
        } finally {
            setExcluindoId(null);
            setClientePendenteExclusao(null);
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
            <header className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h1
                        className="text-[34px] font-bold leading-none text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Clientes
                    </h1>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        Gerencie os clientes cadastrados.
                    </p>
                </div>

                <Button
                    variant="primary"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => navigate('/clientes/novo')}
                >
                    Novo cliente
                </Button>
            </header>

            {loading && (
                <SkeletonCard count={4} heightClassName="min-h-[132px]" />
            )}

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
                        Nenhum cliente cadastrado ainda.
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
                                    {cliente.telefone}
                                </p>
                            </div>

                            <div className="ml-auto flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        setClienteModalAgendamentos(cliente)
                                    }
                                    className="min-h-8 px-3 text-xs"
                                >
                                    Agendamentos (
                                    {agendamentosPorCliente[cliente.id] ?? 0})
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        navigate(
                                            `/clientes/editar/${cliente.id}`,
                                        )
                                    }
                                    className="min-h-8 px-3 text-xs"
                                >
                                    Editar
                                </Button>
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() =>
                                        setClientePendenteExclusao(cliente)
                                    }
                                    disabled={excluindoId === cliente.id}
                                    className="min-h-8 px-3 text-xs"
                                >
                                    {excluindoId === cliente.id
                                        ? 'Excluindo...'
                                        : 'Excluir'}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={Boolean(clientePendenteExclusao)}
                title="Confirmar exclusao"
                description={
                    clientePendenteExclusao
                        ? `Deseja excluir o cliente ${clientePendenteExclusao.nome}?`
                        : ''
                }
                confirmText="Excluir"
                loading={Boolean(excluindoId)}
                onCancel={() => {
                    if (excluindoId) {
                        return;
                    }
                    setClientePendenteExclusao(null);
                }}
                onConfirm={() => {
                    void handleConfirmarExclusao();
                }}
            />

            <AgendamentosClienteModal
                open={Boolean(clienteModalAgendamentos)}
                cliente={clienteModalAgendamentos}
                onClose={() => setClienteModalAgendamentos(null)}
                onRemoverAgendamento={handleRemocaoAgendamentoNoModal}
            />
        </main>
    );
}
