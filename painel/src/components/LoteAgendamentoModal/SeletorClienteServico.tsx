import { useEffect, useMemo, useState } from 'react';
import {
    buscarClientesPorNome,
    type Cliente,
} from '../../services/clientes.service';
import {
    buscarPacoteAtivoDoCliente,
    type PacoteClienteAtivo,
} from '../../services/pacoteCliente.service';
import { listarPacotes, type Pacote } from '../../services/pacotes.service';
import { listarServicos, type Servico } from '../../services/servicos.service';
import {
    buscarSaldoPorServico,
    filtrarServicosPorPacoteAtivo,
} from '../../utils/pacoteCliente';
import {
    filtrarServicosPorPacoteCatalogo,
    formatarLinhaPrecoPacote,
    resolverServicoAposTrocaPacote,
} from '../../utils/pacoteCatalogo';
import { Checkbox } from '../ui/Checkbox';

const DEBOUNCE_MS = 300;

interface SeletorClienteServicoProps {
    clienteSelecionado: Cliente | null;
    servicoId: string;
    pacoteClienteId?: string;
    onClienteChange: (cliente: Cliente | null) => void;
    onServicoChange: (servicoId: string) => void;
    onPacoteClienteChange: (pacoteClienteId: string | undefined) => void;
    modoCatalogoLote?: boolean;
    pacoteCatalogoId?: string;
    aoMudarPacoteCatalogo?: (pacoteId: string) => void;
    aoSelecionarPacoteCatalogo?: (pacote: Pacote | null) => void;
    recarregarPacoteAtivo?: number;
}

type ResultadoPacoteAtivo =
    | {
          clienteId: string;
          tentativa: number;
          pacote: PacoteClienteAtivo | null;
      }
    | { clienteId: string; tentativa: number; erro: string };

type ResultadoCatalogo =
    | { clienteId: string; tentativa: number; pacotes: Pacote[] }
    | { clienteId: string; tentativa: number; erro: string };

const fieldClassName =
    'h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]';

export function SeletorClienteServico({
    clienteSelecionado,
    servicoId,
    pacoteClienteId,
    onClienteChange,
    onServicoChange,
    onPacoteClienteChange,
    modoCatalogoLote = false,
    pacoteCatalogoId = '',
    aoMudarPacoteCatalogo,
    aoSelecionarPacoteCatalogo,
    recarregarPacoteAtivo,
}: SeletorClienteServicoProps) {
    const [queryCliente, setQueryCliente] = useState(
        clienteSelecionado?.nome ?? '',
    );
    const [clientesSugeridos, setClientesSugeridos] = useState<Cliente[]>([]);
    const [servicos, setServicos] = useState<Servico[]>([]);
    const [resultadoPacoteAtivo, setResultadoPacoteAtivo] =
        useState<ResultadoPacoteAtivo | null>(null);
    const [tentativaPacoteAtivo, setTentativaPacoteAtivo] = useState(0);
    const [resultadoCatalogo, setResultadoCatalogo] =
        useState<ResultadoCatalogo | null>(null);
    const [tentativaCatalogo, setTentativaCatalogo] = useState(0);

    useEffect(() => {
        listarServicos()
            .then(setServicos)
            .catch(() => setServicos([]));
    }, []);

    useEffect(() => {
        const termo = queryCliente.trim().toLowerCase();
        if (!termo || clienteSelecionado) {
            setClientesSugeridos([]);
            return;
        }

        let ativo = true;
        const timeoutId = window.setTimeout(() => {
            buscarClientesPorNome(termo)
                .then((lista) => {
                    if (ativo) {
                        setClientesSugeridos(lista);
                    }
                })
                .catch(() => {
                    if (ativo) {
                        setClientesSugeridos([]);
                    }
                });
        }, DEBOUNCE_MS);

        return () => {
            ativo = false;
            window.clearTimeout(timeoutId);
        };
    }, [queryCliente, clienteSelecionado]);

    const tentativaAtivoAtual =
        tentativaPacoteAtivo + (recarregarPacoteAtivo ?? 0);
    const resultadoAtivoAtual =
        resultadoPacoteAtivo &&
        resultadoPacoteAtivo?.clienteId === clienteSelecionado?.id &&
        resultadoPacoteAtivo.tentativa === tentativaAtivoAtual
            ? resultadoPacoteAtivo
            : null;
    const pacoteAtivo =
        resultadoAtivoAtual && 'pacote' in resultadoAtivoAtual
            ? resultadoAtivoAtual.pacote
            : null;

    useEffect(() => {
        const clienteId = clienteSelecionado?.id;
        if (!clienteId) {
            setResultadoPacoteAtivo(null);
            setResultadoCatalogo(null);
            return;
        }

        let ativo = true;
        buscarPacoteAtivoDoCliente(clienteId)
            .then((pacote) => {
                if (ativo) {
                    setResultadoPacoteAtivo({
                        clienteId,
                        tentativa: tentativaAtivoAtual,
                        pacote,
                    });
                }
            })
            .catch((error: unknown) => {
                if (ativo) {
                    setResultadoPacoteAtivo({
                        clienteId,
                        tentativa: tentativaAtivoAtual,
                        erro:
                            error instanceof Error
                                ? error.message
                                : 'Não foi possível consultar o pacote ativo.',
                    });
                }
            });

        return () => {
            ativo = false;
        };
    }, [clienteSelecionado?.id, tentativaAtivoAtual]);

    useEffect(() => {
        const clienteId = clienteSelecionado?.id;
        if (
            !modoCatalogoLote ||
            !clienteId ||
            !resultadoAtivoAtual ||
            !('pacote' in resultadoAtivoAtual) ||
            resultadoAtivoAtual.pacote
        ) {
            return;
        }

        let ativo = true;
        listarPacotes()
            .then((pacotes) => {
                if (ativo) {
                    setResultadoCatalogo({
                        clienteId,
                        tentativa: tentativaCatalogo,
                        pacotes,
                    });
                }
            })
            .catch((error: unknown) => {
                if (ativo) {
                    setResultadoCatalogo({
                        clienteId,
                        tentativa: tentativaCatalogo,
                        erro:
                            error instanceof Error
                                ? error.message
                                : 'Não foi possível carregar os pacotes.',
                    });
                }
            });

        return () => {
            ativo = false;
        };
    }, [
        clienteSelecionado?.id,
        modoCatalogoLote,
        resultadoAtivoAtual,
        tentativaCatalogo,
    ]);

    const resultadoCatalogoAtual =
        resultadoCatalogo &&
        resultadoCatalogo?.clienteId === clienteSelecionado?.id &&
        resultadoCatalogo.tentativa === tentativaCatalogo
            ? resultadoCatalogo
            : null;
    const pacotesCatalogo =
        resultadoCatalogoAtual && 'pacotes' in resultadoCatalogoAtual
            ? resultadoCatalogoAtual.pacotes
            : [];
    const pacoteCatalogoSelecionado = pacotesCatalogo.find(
        (pacote) => pacote.id === pacoteCatalogoId,
    );

    const servicosDisponiveis = useMemo(() => {
        if (modoCatalogoLote && pacoteCatalogoSelecionado) {
            return filtrarServicosPorPacoteCatalogo(
                servicos,
                pacoteCatalogoSelecionado,
            );
        }
        return filtrarServicosPorPacoteAtivo(
            servicos,
            pacoteAtivo,
            Boolean(pacoteClienteId),
        );
    }, [
        modoCatalogoLote,
        pacoteAtivo,
        pacoteCatalogoSelecionado,
        pacoteClienteId,
        servicos,
    ]);

    const saldoServicoSelecionado = buscarSaldoPorServico(
        pacoteAtivo,
        servicoId,
    );

    useEffect(() => {
        if (
            modoCatalogoLote &&
            pacoteCatalogoId &&
            !servicosDisponiveis.some((servico) => servico.id === servicoId)
        ) {
            if (servicoId) {
                onServicoChange('');
            }
            return;
        }
        if (servicosDisponiveis.length === 0) {
            if (servicoId) {
                onServicoChange('');
            }
            return;
        }

        if (!servicosDisponiveis.some((servico) => servico.id === servicoId)) {
            onServicoChange(servicosDisponiveis[0].id);
        }
    }, [
        modoCatalogoLote,
        onServicoChange,
        pacoteCatalogoId,
        servicoId,
        servicosDisponiveis,
    ]);

    return (
        <div className="space-y-4">
            <div className="relative">
                <label
                    htmlFor="lote-cliente"
                    className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                    Cliente
                </label>
                <input
                    id="lote-cliente"
                    type="text"
                    className={fieldClassName}
                    placeholder="Buscar cliente por nome..."
                    value={queryCliente}
                    onChange={(event) => {
                        setQueryCliente(event.target.value);
                        if (clienteSelecionado) {
                            onClienteChange(null);
                        }
                    }}
                />
                {clientesSugeridos.length > 0 && (
                    <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)]">
                        {clientesSugeridos.map((cliente) => (
                            <li key={cliente.id}>
                                <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-elevated)]"
                                    onClick={() => {
                                        onClienteChange(cliente);
                                        setQueryCliente(cliente.nome);
                                        setClientesSugeridos([]);
                                    }}
                                >
                                    {cliente.nome} — {cliente.telefone}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {modoCatalogoLote && clienteSelecionado && !resultadoAtivoAtual && (
                <p
                    className="text-sm text-[var(--color-text-secondary)]"
                    role="status"
                >
                    Verificando pacote ativo...
                </p>
            )}

            {modoCatalogoLote &&
                resultadoAtivoAtual &&
                'erro' in resultadoAtivoAtual && (
                    <div
                        className="space-y-2 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
                        role="alert"
                    >
                        <p>
                            Não foi possível consultar o pacote ativo:{' '}
                            {resultadoAtivoAtual.erro}
                        </p>
                        <button
                            type="button"
                            onClick={() =>
                                setTentativaPacoteAtivo((atual) => atual + 1)
                            }
                            className="font-semibold underline"
                        >
                            Tentar novamente
                        </button>
                    </div>
                )}

            {modoCatalogoLote &&
                resultadoAtivoAtual &&
                'pacote' in resultadoAtivoAtual &&
                !resultadoAtivoAtual.pacote && (
                    <div className="space-y-2">
                        <label
                            htmlFor="lote-pacote-catalogo"
                            className="block text-sm font-semibold text-[var(--color-text-primary)]"
                        >
                            Pacote do catálogo (opcional)
                        </label>
                        {!resultadoCatalogoAtual ? (
                            <p
                                className="text-sm text-[var(--color-text-secondary)]"
                                role="status"
                            >
                                Carregando pacotes...
                            </p>
                        ) : 'erro' in resultadoCatalogoAtual ? (
                            <div
                                className="space-y-2 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
                                role="alert"
                            >
                                <p>{resultadoCatalogoAtual.erro}</p>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setTentativaCatalogo(
                                            (atual) => atual + 1,
                                        )
                                    }
                                    className="font-semibold underline"
                                >
                                    Tentar novamente
                                </button>
                            </div>
                        ) : (
                            <select
                                id="lote-pacote-catalogo"
                                aria-label="Pacote do catálogo (opcional)"
                                value={pacoteCatalogoId}
                                onChange={(event) => {
                                    const pacoteId = event.target.value;
                                    const pacote = pacotesCatalogo.find(
                                        (item) => item.id === pacoteId,
                                    );
                                    aoMudarPacoteCatalogo?.(pacoteId);
                                    aoSelecionarPacoteCatalogo?.(
                                        pacote ?? null,
                                    );
                                    onPacoteClienteChange(undefined);
                                    const disponiveis =
                                        filtrarServicosPorPacoteCatalogo(
                                            servicos,
                                            pacote ?? null,
                                        );
                                    onServicoChange(
                                        resolverServicoAposTrocaPacote(
                                            servicoId,
                                            disponiveis,
                                        ),
                                    );
                                }}
                                disabled={servicos.length === 0}
                                className={fieldClassName}
                            >
                                <option value="">Sem pacote</option>
                                {pacotesCatalogo.map((pacote) => (
                                    <option key={pacote.id} value={pacote.id}>
                                        {pacote.nome}
                                    </option>
                                ))}
                            </select>
                        )}
                        {pacoteCatalogoSelecionado && (
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                {formatarLinhaPrecoPacote(
                                    pacoteCatalogoSelecionado.preco,
                                )}
                            </p>
                        )}
                    </div>
                )}

            {modoCatalogoLote &&
                pacoteAtivo &&
                pacoteAtivo.servicos.every(
                    (saldo) => saldo.quantidadeRestante <= 0,
                ) && (
                    <p
                        className="rounded-[8px] border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-text-primary)]"
                        role="status"
                    >
                        Pacote ativo sem saldo utilizável. Encerre-o em Clientes
                        para escolher um pacote do catálogo.
                    </p>
                )}

            <div>
                <label
                    htmlFor="lote-servico"
                    className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]"
                >
                    Serviço
                </label>
                <select
                    id="lote-servico"
                    className={fieldClassName}
                    value={servicoId}
                    onChange={(event) => onServicoChange(event.target.value)}
                >
                    <option value="">Selecione um serviço</option>
                    {servicosDisponiveis.map((servico) => (
                        <option key={servico.id} value={servico.id}>
                            {servico.nome}
                        </option>
                    ))}
                </select>
            </div>

            {pacoteAtivo && saldoServicoSelecionado && (
                <Checkbox
                    checked={pacoteClienteId === pacoteAtivo.id}
                    disabled={saldoServicoSelecionado.quantidadeRestante <= 0}
                    onChange={(checked) =>
                        onPacoteClienteChange(
                            checked ? pacoteAtivo.id : undefined,
                        )
                    }
                >
                    Vincular ao pacote ativo deste cliente (
                    {saldoServicoSelecionado.quantidadeRestante} de{' '}
                    {saldoServicoSelecionado.quantidadeTotal} usos de{' '}
                    {saldoServicoSelecionado.servico.nome})
                </Checkbox>
            )}
        </div>
    );
}
