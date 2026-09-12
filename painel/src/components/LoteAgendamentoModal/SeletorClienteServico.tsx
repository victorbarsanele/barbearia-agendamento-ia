import { useEffect, useState } from 'react';
import {
    buscarClientesPorNome,
    type Cliente,
} from '../../services/clientes.service';
import {
    buscarPacoteAtivoDoCliente,
    type PacoteClienteAtivo,
} from '../../services/pacoteCliente.service';
import { listarServicos, type Servico } from '../../services/servicos.service';

const DEBOUNCE_MS = 300;

interface SeletorClienteServicoProps {
    clienteSelecionado: Cliente | null;
    servicoId: string;
    pacoteClienteId?: string;
    onClienteChange: (cliente: Cliente | null) => void;
    onServicoChange: (servicoId: string) => void;
    onPacoteClienteChange: (pacoteClienteId: string | undefined) => void;
}

const fieldClassName =
    'h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]';

export function SeletorClienteServico({
    clienteSelecionado,
    servicoId,
    pacoteClienteId,
    onClienteChange,
    onServicoChange,
    onPacoteClienteChange,
}: SeletorClienteServicoProps) {
    const [queryCliente, setQueryCliente] = useState(
        clienteSelecionado?.nome ?? '',
    );
    const [clientesSugeridos, setClientesSugeridos] = useState<Cliente[]>([]);
    const [servicos, setServicos] = useState<Servico[]>([]);
    const [pacoteAtivo, setPacoteAtivo] = useState<PacoteClienteAtivo | null>(
        null,
    );

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

    useEffect(() => {
        if (!clienteSelecionado?.id) {
            setPacoteAtivo(null);
            onPacoteClienteChange(undefined);
            return;
        }

        let ativo = true;
        buscarPacoteAtivoDoCliente(clienteSelecionado.id)
            .then((ativoAtual) => {
                if (ativo) {
                    setPacoteAtivo(ativoAtual);
                }
            })
            .catch(() => {
                if (ativo) {
                    setPacoteAtivo(null);
                }
            });

        return () => {
            ativo = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteSelecionado?.id]);

    return (
        <div className="space-y-4">
            <div className="relative">
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Cliente
                </label>
                <input
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

            <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Serviço
                </label>
                <select
                    className={fieldClassName}
                    value={servicoId}
                    onChange={(event) => onServicoChange(event.target.value)}
                >
                    <option value="">Selecione um serviço</option>
                    {servicos.map((servico) => (
                        <option key={servico.id} value={servico.id}>
                            {servico.nome}
                        </option>
                    ))}
                </select>
            </div>

            {pacoteAtivo && (
                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <input
                        type="checkbox"
                        checked={pacoteClienteId === pacoteAtivo.id}
                        onChange={(event) =>
                            onPacoteClienteChange(
                                event.target.checked
                                    ? pacoteAtivo.id
                                    : undefined,
                            )
                        }
                    />
                    Vincular ao pacote ativo deste cliente (
                    {pacoteAtivo.quantidadeRestante} sessões restantes)
                </label>
            )}
        </div>
    );
}
