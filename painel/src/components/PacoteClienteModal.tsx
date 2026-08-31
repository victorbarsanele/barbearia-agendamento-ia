import { useEffect, useMemo, useState } from 'react';
import type { Cliente } from '../services/clientes.service';
import { listarPacotes, type Pacote } from '../services/pacotes.service';
import {
    buscarPacoteAtivoDoCliente,
    desvincularPacoteCliente,
    vincularPacoteCliente,
    type PacoteClienteAtivo,
} from '../services/pacoteCliente.service';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ConfirmDialog';

interface PacoteClienteModalProps {
    open: boolean;
    cliente: Cliente | null;
    onClose: () => void;
}

function formatarDataEmBrasilia(isoDate: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(isoDate));
}

function calcularValidoAte(dataInicio: string, duracaoDias: number): string {
    const inicio = new Date(dataInicio);
    const validoAte = new Date(
        inicio.getTime() + duracaoDias * 24 * 60 * 60 * 1000,
    );
    return formatarDataEmBrasilia(validoAte.toISOString());
}

export function PacoteClienteModal({
    open,
    cliente,
    onClose,
}: PacoteClienteModalProps) {
    const [carregandoAtivo, setCarregandoAtivo] = useState(false);
    const [pacoteAtivo, setPacoteAtivo] = useState<PacoteClienteAtivo | null>(
        null,
    );

    const [pacotesDisponiveis, setPacotesDisponiveis] = useState<Pacote[]>([]);
    const [carregandoPacotes, setCarregandoPacotes] = useState(false);
    const [pacoteSelecionadoId, setPacoteSelecionadoId] = useState('');

    const [vinculando, setVinculando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const [confirmandoDesvinculo, setConfirmandoDesvinculo] = useState(false);
    const [desvinculando, setDesvinculando] = useState(false);

    useEffect(() => {
        if (!open || !cliente) {
            return;
        }

        let ativo = true;

        const carregarPacoteAtivo = async () => {
            setCarregandoAtivo(true);
            setErro(null);
            setPacoteAtivo(null);

            try {
                const ativoAtual = await buscarPacoteAtivoDoCliente(cliente.id);
                if (!ativo) {
                    return;
                }

                setPacoteAtivo(ativoAtual);

                if (!ativoAtual) {
                    setCarregandoPacotes(true);
                    const pacotes = await listarPacotes();
                    if (!ativo) {
                        return;
                    }
                    setPacotesDisponiveis(pacotes);
                }
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar o pacote do cliente.';
                setErro(message);
            } finally {
                if (ativo) {
                    setCarregandoAtivo(false);
                    setCarregandoPacotes(false);
                }
            }
        };

        void carregarPacoteAtivo();

        return () => {
            ativo = false;
        };
    }, [open, cliente]);

    const podeVincular = useMemo(() => {
        return !!pacoteSelecionadoId && !vinculando;
    }, [pacoteSelecionadoId, vinculando]);

    const handleDesvincular = async () => {
        if (!pacoteAtivo) {
            return;
        }

        setDesvinculando(true);
        setErro(null);

        try {
            await desvincularPacoteCliente(pacoteAtivo.id);
            setConfirmandoDesvinculo(false);
            setPacoteAtivo(null);

            if (cliente) {
                setCarregandoPacotes(true);
                const pacotes = await listarPacotes();
                setPacotesDisponiveis(pacotes);
                setCarregandoPacotes(false);
            }
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível desvincular o pacote.';
            setErro(message);
            setConfirmandoDesvinculo(false);
        } finally {
            setDesvinculando(false);
        }
    };

    const handleVincular = async () => {
        if (!cliente || !pacoteSelecionadoId) {
            return;
        }

        setVinculando(true);
        setErro(null);

        try {
            const novoPacoteCliente = await vincularPacoteCliente({
                clienteId: cliente.id,
                pacoteId: pacoteSelecionadoId,
            });
            setPacoteAtivo(novoPacoteCliente);
            setPacoteSelecionadoId('');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível vincular o pacote.';
            setErro(message);

            try {
                const ativoAtual = await buscarPacoteAtivoDoCliente(cliente.id);
                setPacoteAtivo(ativoAtual);
            } catch {
                // mantém a mensagem de erro original se a revalidação falhar
            }
        } finally {
            setVinculando(false);
        }
    };

    if (!open || !cliente) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Pacote de ${cliente.nome}`}
        >
            <div className="w-full max-w-[480px] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
                <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
                    <h2
                        className="text-xl font-semibold text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Pacote de {cliente.nome}
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
                    {carregandoAtivo && (
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Carregando pacote do cliente...
                        </p>
                    )}

                    {erro && (
                        <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                            {erro}
                        </div>
                    )}

                    {!carregandoAtivo && pacoteAtivo && (
                        <div className="rounded-md border border-[var(--color-gold)]/35 bg-[var(--color-gold-muted)] p-4">
                            <p className="text-base font-bold text-[var(--color-text-primary)]">
                                {pacoteAtivo.pacote.nome}
                            </p>
                            <p className="mt-2 text-sm font-semibold text-[var(--color-gold)]">
                                {pacoteAtivo.quantidadeRestante} de{' '}
                                {pacoteAtivo.quantidadeTotal} usos restantes
                            </p>
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                Início:{' '}
                                {formatarDataEmBrasilia(pacoteAtivo.dataInicio)}
                            </p>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Válido até (referência):{' '}
                                {calcularValidoAte(
                                    pacoteAtivo.dataInicio,
                                    pacoteAtivo.pacote.duracaoDias,
                                )}
                            </p>

                            <Button
                                type="button"
                                variant="danger"
                                fullWidth
                                className="mt-3 min-h-10"
                                onClick={() => setConfirmandoDesvinculo(true)}
                            >
                                Desvincular pacote
                            </Button>
                        </div>
                    )}

                    {!carregandoAtivo && !pacoteAtivo && (
                        <div className="space-y-3">
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Este cliente não possui pacote ativo. Selecione
                                um pacote para vincular.
                            </p>

                            {carregandoPacotes && (
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Carregando pacotes...
                                </p>
                            )}

                            {!carregandoPacotes &&
                                pacotesDisponiveis.length === 0 && (
                                    <p className="text-sm text-[var(--color-text-secondary)]">
                                        Nenhum pacote cadastrado ainda.
                                    </p>
                                )}

                            {!carregandoPacotes &&
                                pacotesDisponiveis.length > 0 && (
                                    <>
                                        <select
                                            value={pacoteSelecionadoId}
                                            onChange={(event) =>
                                                setPacoteSelecionadoId(
                                                    event.target.value,
                                                )
                                            }
                                            disabled={vinculando}
                                            className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]"
                                        >
                                            <option value="">
                                                Selecione um pacote
                                            </option>
                                            {pacotesDisponiveis.map(
                                                (pacote) => (
                                                    <option
                                                        key={pacote.id}
                                                        value={pacote.id}
                                                    >
                                                        {pacote.nome} (
                                                        {pacote.quantidade}{' '}
                                                        usos,{' '}
                                                        {pacote.duracaoDias}{' '}
                                                        dias)
                                                    </option>
                                                ),
                                            )}
                                        </select>

                                        <Button
                                            type="button"
                                            variant="primary"
                                            fullWidth
                                            disabled={!podeVincular}
                                            onClick={() => {
                                                void handleVincular();
                                            }}
                                            className="min-h-11"
                                        >
                                            {vinculando
                                                ? 'Vinculando...'
                                                : 'Vincular'}
                                        </Button>
                                    </>
                                )}
                        </div>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirmandoDesvinculo}
                title="Desvincular pacote"
                description="Tem certeza que deseja desvincular este pacote? Os créditos restantes serão perdidos e não poderão ser reativados."
                confirmText="Desvincular"
                loading={desvinculando}
                onCancel={() => {
                    if (desvinculando) {
                        return;
                    }
                    setConfirmandoDesvinculo(false);
                }}
                onConfirm={() => {
                    void handleDesvincular();
                }}
            />
        </div>
    );
}
