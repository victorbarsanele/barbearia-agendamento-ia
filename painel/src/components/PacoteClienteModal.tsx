import { useEffect, useMemo, useState } from 'react';
import type { Cliente } from '../services/clientes.service';
import { listarPacotes, type Pacote } from '../services/pacotes.service';
import {
    atualizarUsosAnteriores,
    buscarPacoteAtivoDoCliente,
    desvincularPacoteCliente,
    vincularPacoteCliente,
    type PacoteClienteAtivo,
} from '../services/pacoteCliente.service';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { ConfirmDialog } from './ConfirmDialog';
import { formatPrecoNumberToInputBR } from '../utils/preco';
import {
    montarPayloadUsosAnteriores,
    rotuloPrimeiroNumero,
    validarUsosAnteriores,
} from '../utils/usosAnteriores';

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

interface LinhaUsoAnterior {
    servicoId: string;
    valor: string;
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
    const [linhasUsosAnteriores, setLinhasUsosAnteriores] = useState<
        LinhaUsoAnterior[]
    >([]);

    const [vinculando, setVinculando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const [editandoServicoId, setEditandoServicoId] = useState<string | null>(
        null,
    );
    const [valorEditado, setValorEditado] = useState('');
    const [erroEdicao, setErroEdicao] = useState<string | null>(null);
    const [salvandoEdicao, setSalvandoEdicao] = useState(false);

    const [confirmandoDesvinculo, setConfirmandoDesvinculo] = useState(false);
    const [desvinculando, setDesvinculando] = useState(false);

    const pacoteSelecionado = useMemo(
        () =>
            pacotesDisponiveis.find(
                (pacote) => pacote.id === pacoteSelecionadoId,
            ) ?? null,
        [pacoteSelecionadoId, pacotesDisponiveis],
    );

    const errosUsosAnteriores = useMemo(
        () =>
            new Map(
                linhasUsosAnteriores.map((linha) => {
                    const servico = pacoteSelecionado?.servicos.find(
                        (item) => item.servicoId === linha.servicoId,
                    );
                    return [
                        linha.servicoId,
                        servico
                            ? validarUsosAnteriores(
                                  linha.valor,
                                  servico.quantidadeTotal,
                              )
                            : null,
                    ];
                }),
            ),
        [linhasUsosAnteriores, pacoteSelecionado],
    );

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
        return (
            !!pacoteSelecionadoId &&
            !vinculando &&
            linhasUsosAnteriores.every(
                (linha) => !errosUsosAnteriores.get(linha.servicoId),
            )
        );
    }, [
        errosUsosAnteriores,
        linhasUsosAnteriores,
        pacoteSelecionadoId,
        vinculando,
    ]);

    const handleSelecionarPacote = (pacoteId: string) => {
        setPacoteSelecionadoId(pacoteId);
        const pacote = pacotesDisponiveis.find((item) => item.id === pacoteId);
        setLinhasUsosAnteriores(
            pacote?.servicos.map((servico) => ({
                servicoId: servico.servicoId,
                valor: '0',
            })) ?? [],
        );
    };

    const atualizarLinhaUsoAnterior = (servicoId: string, valor: string) => {
        setLinhasUsosAnteriores((linhas) =>
            linhas.map((linha) =>
                linha.servicoId === servicoId ? { ...linha, valor } : linha,
            ),
        );
    };

    const carregarPacotesDisponiveis = async () => {
        setCarregandoPacotes(true);
        try {
            setPacotesDisponiveis(await listarPacotes());
        } finally {
            setCarregandoPacotes(false);
        }
    };

    const aplicarPacoteAtualizado = async (atualizado: PacoteClienteAtivo) => {
        if (atualizado.status === 'ATIVO') {
            setPacoteAtivo(atualizado);
            return;
        }

        setPacoteAtivo(null);
        await carregarPacotesDisponiveis();
    };

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
                usosAnteriores:
                    montarPayloadUsosAnteriores(linhasUsosAnteriores),
            });
            setPacoteAtivo(novoPacoteCliente);
            setPacoteSelecionadoId('');
            setLinhasUsosAnteriores([]);
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

    const iniciarEdicao = (servicoId: string, usosAnteriores: number) => {
        setEditandoServicoId(servicoId);
        setValorEditado(String(usosAnteriores));
        setErroEdicao(null);
    };

    const cancelarEdicao = () => {
        if (salvandoEdicao) {
            return;
        }
        setEditandoServicoId(null);
        setValorEditado('');
        setErroEdicao(null);
    };

    const salvarEdicao = async (quantidadeTotal: number) => {
        if (!pacoteAtivo || !editandoServicoId) {
            return;
        }

        const validacao = validarUsosAnteriores(valorEditado, quantidadeTotal);
        if (validacao) {
            setErroEdicao(validacao);
            return;
        }

        setSalvandoEdicao(true);
        setErroEdicao(null);

        try {
            const atualizado = await atualizarUsosAnteriores(
                pacoteAtivo.id,
                editandoServicoId,
                Number(valorEditado || 0),
            );
            setEditandoServicoId(null);
            setValorEditado('');
            await aplicarPacoteAtualizado(atualizado);
        } catch (error) {
            setErroEdicao(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível atualizar os usos anteriores.',
            );
        } finally {
            setSalvandoEdicao(false);
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
                    <IconButton
                        type="button"
                        onClick={onClose}
                        ariaLabel="Fechar"
                    >
                        X
                    </IconButton>
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
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Preço: R${' '}
                                {formatPrecoNumberToInputBR(
                                    pacoteAtivo.pacote.preco,
                                )}
                            </p>
                            <ul className="mt-2 space-y-1 text-sm font-semibold text-[var(--color-gold)]">
                                {pacoteAtivo.servicos.map((saldo) => {
                                    const editando =
                                        editandoServicoId === saldo.servicoId;

                                    return (
                                        <li
                                            key={saldo.servicoId}
                                            className="space-y-1"
                                        >
                                            {editando ? (
                                                <div className="space-y-2 rounded-[8px] border border-[var(--color-border)] p-2">
                                                    <label className="block text-xs text-[var(--color-text-secondary)]">
                                                        Usos anteriores de{' '}
                                                        {saldo.servico.nome}
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            max={
                                                                saldo.quantidadeTotal -
                                                                1
                                                            }
                                                            value={valorEditado}
                                                            onChange={(event) =>
                                                                setValorEditado(
                                                                    event.target
                                                                        .value,
                                                                )
                                                            }
                                                            className="mt-1 h-9 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-sm text-[var(--color-text-primary)]"
                                                        />
                                                    </label>
                                                    {erroEdicao && (
                                                        <p className="text-xs text-[var(--color-danger)]">
                                                            {erroEdicao}
                                                        </p>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            className="min-h-9 px-2 text-xs"
                                                            disabled={
                                                                salvandoEdicao
                                                            }
                                                            onClick={() => {
                                                                void salvarEdicao(
                                                                    saldo.quantidadeTotal,
                                                                );
                                                            }}
                                                        >
                                                            {salvandoEdicao
                                                                ? 'Salvando...'
                                                                : 'Salvar'}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            className="min-h-9 px-2 text-xs"
                                                            disabled={
                                                                salvandoEdicao
                                                            }
                                                            onClick={
                                                                cancelarEdicao
                                                            }
                                                        >
                                                            Cancelar
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-between gap-2">
                                                    <span>
                                                        {
                                                            saldo.quantidadeRestante
                                                        }{' '}
                                                        de{' '}
                                                        {saldo.quantidadeTotal}{' '}
                                                        usos de{' '}
                                                        {saldo.servico.nome}
                                                        {saldo.usosAnteriores >
                                                            0 && (
                                                            <span className="ml-1 font-normal text-[var(--color-text-secondary)]">
                                                                (
                                                                {
                                                                    saldo.usosAnteriores
                                                                }{' '}
                                                                uso
                                                                {saldo.usosAnteriores ===
                                                                1
                                                                    ? ''
                                                                    : 's'}{' '}
                                                                anterior
                                                                {saldo.usosAnteriores ===
                                                                1
                                                                    ? ''
                                                                    : 'es'}
                                                                )
                                                            </span>
                                                        )}
                                                    </span>
                                                    {pacoteAtivo.status ===
                                                        'ATIVO' && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            className="min-h-8 px-2 text-xs"
                                                            onClick={() =>
                                                                iniciarEdicao(
                                                                    saldo.servicoId,
                                                                    saldo.usosAnteriores,
                                                                )
                                                            }
                                                        >
                                                            Editar
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
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
                                className="mt-3"
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
                                                handleSelecionarPacote(
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
                                                        {pacote.servicos
                                                            .map(
                                                                (item) =>
                                                                    `${item.servico.nome}: ${item.quantidadeTotal}`,
                                                            )
                                                            .join(', ')}{' '}
                                                        usos,{' '}
                                                        {pacote.duracaoDias}{' '}
                                                        dias, R${' '}
                                                        {formatPrecoNumberToInputBR(
                                                            pacote.preco,
                                                        )}
                                                        )
                                                    </option>
                                                ),
                                            )}
                                        </select>

                                        {pacoteSelecionado && (
                                            <div className="space-y-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-inset)] p-3">
                                                {pacoteSelecionado.servicos.map(
                                                    (servico) => {
                                                        const linha =
                                                            linhasUsosAnteriores.find(
                                                                (item) =>
                                                                    item.servicoId ===
                                                                    servico.servicoId,
                                                            );
                                                        const valor =
                                                            linha?.valor ?? '0';
                                                        const erroCampo =
                                                            errosUsosAnteriores.get(
                                                                servico.servicoId,
                                                            );
                                                        const numero = Number(
                                                            valor || 0,
                                                        );

                                                        return (
                                                            <div
                                                                key={
                                                                    servico.servicoId
                                                                }
                                                                className="space-y-1"
                                                            >
                                                                <label className="block text-sm text-[var(--color-text-primary)]">
                                                                    {
                                                                        servico
                                                                            .servico
                                                                            .nome
                                                                    }{' '}
                                                                    <span className="text-[var(--color-text-secondary)]">
                                                                        (total:{' '}
                                                                        {
                                                                            servico.quantidadeTotal
                                                                        }
                                                                        )
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        min={0}
                                                                        max={
                                                                            servico.quantidadeTotal -
                                                                            1
                                                                        }
                                                                        value={
                                                                            valor
                                                                        }
                                                                        onChange={(
                                                                            event,
                                                                        ) =>
                                                                            atualizarLinhaUsoAnterior(
                                                                                servico.servicoId,
                                                                                event
                                                                                    .target
                                                                                    .value,
                                                                            )
                                                                        }
                                                                        aria-label={`Usos já realizados antes do sistema: ${servico.servico.nome}`}
                                                                        className="mt-1 h-10 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                                                                    />
                                                                </label>
                                                                {erroCampo && (
                                                                    <p className="text-xs text-[var(--color-danger)]">
                                                                        {
                                                                            erroCampo
                                                                        }
                                                                    </p>
                                                                )}
                                                                {!erroCampo &&
                                                                    numero >
                                                                        0 && (
                                                                        <p className="text-xs text-[var(--color-gold)]">
                                                                            {rotuloPrimeiroNumero(
                                                                                numero,
                                                                                servico.quantidadeTotal,
                                                                            )}
                                                                        </p>
                                                                    )}
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        )}

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
