import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Agendamento } from '../services/agendamentos.service';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface AgendamentoItemProps {
    agendamento: Agendamento;
    onEditar: (id: string) => void;
    onCancelar: (id: string, notificarCliente: boolean) => Promise<void>;
    cancelando: boolean;
    onConcluir: (id: string) => Promise<void>;
    concluindo: boolean;
}

const STATUS_LABEL: Record<Agendamento['status'], string> = {
    AGENDADO: 'Agendado',
    CONFIRMADO: 'Confirmado',
    CANCELADO: 'Cancelado',
    CONCLUIDO: 'Concluído',
};

function formatarHora(isoDate: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(isoDate));
}

export function AgendamentoItem({
    agendamento,
    onEditar,
    onCancelar,
    cancelando,
    onConcluir,
    concluindo,
}: AgendamentoItemProps) {
    const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
    const [notificarCliente, setNotificarCliente] = useState(false);

    const podeCancelar = agendamento.status !== 'CANCELADO';
    const podeEditar = agendamento.status !== 'CANCELADO';
    const ehAgendamentoDePacote = Boolean(agendamento.pacoteClienteId);
    const podeConcluir = ehAgendamentoDePacote && !agendamento.concluido;

    const abrirConfirmacao = () => {
        setConfirmacaoAberta(true);
    };

    const fecharConfirmacao = () => {
        if (cancelando) {
            return;
        }

        setConfirmacaoAberta(false);
    };

    const confirmarCancelamento = async () => {
        await onCancelar(agendamento.id, notificarCliente);
        setConfirmacaoAberta(false);
    };

    return (
        <li>
            <Card className="space-y-4 bg-[var(--color-surface-elevated)] p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p
                            className="text-3xl font-bold leading-none text-[var(--color-gold)]"
                            style={{ fontFamily: 'var(--font-title)' }}
                        >
                            {formatarHora(agendamento.dataHoraInicio)}
                        </p>
                        <p className="mt-2 truncate text-base font-bold text-[var(--color-text-primary)]">
                            {agendamento.cliente.nome}
                        </p>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            {agendamento.servico.nome}
                        </p>
                    </div>

                    <Badge status={agendamento.status}>
                        {STATUS_LABEL[agendamento.status]}
                    </Badge>
                </div>

                {ehAgendamentoDePacote && (
                    <div className="flex items-center gap-2">
                        <span className="inline-flex min-h-6 items-center rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-gold-muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-gold)]">
                            Pacote
                        </span>
                        {agendamento.concluido && (
                            <span className="inline-flex min-h-6 items-center rounded-full border border-[var(--color-success)]/35 bg-[color:rgba(22,163,74,0.16)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#86efac]">
                                Concluído
                            </span>
                        )}
                    </div>
                )}

                {(podeEditar || podeCancelar) && (
                    <div className="flex gap-2 border-t border-[var(--color-border)] pt-3">
                        {podeEditar && (
                            <Button
                                variant="ghost"
                                fullWidth
                                className="min-h-9 px-3 text-xs"
                                onClick={() => onEditar(agendamento.id)}
                            >
                                Editar
                            </Button>
                        )}

                        {podeConcluir && (
                            <Button
                                variant="ghost"
                                fullWidth
                                className="min-h-9 px-3 text-xs"
                                type="button"
                                onClick={() => void onConcluir(agendamento.id)}
                                disabled={concluindo}
                            >
                                {concluindo
                                    ? 'Concluindo...'
                                    : 'Marcar como concluído'}
                            </Button>
                        )}

                        {podeCancelar && (
                            <Button
                                variant="danger"
                                fullWidth
                                className="min-h-9 px-3 text-xs"
                                type="button"
                                onClick={abrirConfirmacao}
                                disabled={cancelando}
                            >
                                {cancelando ? 'Cancelando...' : 'Cancelar'}
                            </Button>
                        )}
                    </div>
                )}
            </Card>

            {confirmacaoAberta && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
                    onClick={fecharConfirmacao}
                    role="presentation"
                >
                    <Card
                        className="w-full max-w-md space-y-4 p-6"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h2
                            className="text-2xl font-bold text-[var(--color-gold)]"
                            style={{ fontFamily: 'var(--font-title)' }}
                        >
                            Confirmar cancelamento
                        </h2>

                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Tem certeza que deseja cancelar o agendamento de{' '}
                            <span className="font-semibold text-[var(--color-text-primary)]">
                                {agendamento.cliente.nome}
                            </span>
                            ?
                        </p>

                        <label className="flex items-start gap-3 text-sm text-[var(--color-text-secondary)]">
                            <input
                                type="checkbox"
                                checked={notificarCliente}
                                onChange={(event) =>
                                    setNotificarCliente(event.target.checked)
                                }
                                className="peer sr-only"
                            />
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[var(--color-gold)]/30 bg-[var(--color-surface)] peer-checked:border-[var(--color-gold)] peer-checked:bg-[var(--color-gold)] peer-checked:[&>svg]:opacity-100">
                                <Check
                                    className="h-3 w-3 text-black opacity-0"
                                    strokeWidth={3}
                                />
                            </span>
                            <span>
                                Notificar cliente sobre o cancelamento via
                                WhatsApp
                            </span>
                        </label>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                variant="danger"
                                fullWidth
                                className="sm:w-auto"
                                type="button"
                                onClick={() => void confirmarCancelamento()}
                                disabled={cancelando}
                            >
                                {cancelando ? 'Cancelando...' : 'Sim, cancelar'}
                            </Button>
                            <Button
                                variant="ghost"
                                fullWidth
                                className="sm:w-auto"
                                type="button"
                                onClick={fecharConfirmacao}
                                disabled={cancelando}
                            >
                                Voltar
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </li>
    );
}
