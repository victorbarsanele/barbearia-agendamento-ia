import { useState } from 'react';
import { Check, CheckCircle2, Clock, Package } from 'lucide-react';
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
    const [confirmacaoConclusaoAberta, setConfirmacaoConclusaoAberta] =
        useState(false);
    const [notificarCliente, setNotificarCliente] = useState(false);

    const podeCancelar = agendamento.status !== 'CANCELADO';
    const podeEditar = agendamento.status !== 'CANCELADO';
    const ehAgendamentoDePacote = Boolean(agendamento.pacoteClienteId);
    const podeConcluir = ehAgendamentoDePacote && !agendamento.concluido;
    const ehPacoteConcluido = ehAgendamentoDePacote && agendamento.concluido;

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

    const abrirConfirmacaoConclusao = () => {
        if (podeConcluir && !concluindo) {
            setConfirmacaoConclusaoAberta(true);
        }
    };

    const fecharConfirmacaoConclusao = () => {
        if (concluindo) {
            return;
        }

        setConfirmacaoConclusaoAberta(false);
    };

    const confirmarConclusao = async () => {
        await onConcluir(agendamento.id);
        setConfirmacaoConclusaoAberta(false);
    };

    return (
        <li>
            <Card
                className={`space-y-4 rounded-[14px] bg-[var(--color-surface-elevated)] p-4 transition-opacity ${
                    ehPacoteConcluido || agendamento.status === 'CANCELADO'
                        ? 'opacity-60'
                        : ''
                }`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-bold text-[var(--color-text-primary)]">
                            {agendamento.cliente.nome}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-[var(--color-text-secondary)]">
                            {agendamento.servico.nome}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        {ehAgendamentoDePacote &&
                            (ehPacoteConcluido ? (
                                <span
                                    className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-surface-elevated)] text-[var(--color-gold)]"
                                    aria-label="Pacote concluído"
                                    title="Pacote concluído"
                                >
                                    <Package className="h-5 w-5" />
                                    <CheckCircle2 className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-[var(--color-surface-elevated)] text-[var(--color-success)]" />
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={abrirConfirmacaoConclusao}
                                    disabled={concluindo}
                                    aria-label="Marcar pacote como concluído"
                                    title="Marcar pacote como concluído"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-surface-elevated)] text-[var(--color-gold)] transition-transform hover:scale-110 disabled:opacity-60"
                                >
                                    <Package className="h-5 w-5" />
                                </button>
                            ))}

                        <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--color-gold)]/35 bg-[var(--color-surface-elevated)] px-3.5 py-1.5 text-sm font-semibold text-[var(--color-gold)]">
                            <Clock className="h-4 w-4" />
                            {formatarHora(agendamento.dataHoraInicio)}
                        </span>
                    </div>
                </div>

                {agendamento.status === 'CANCELADO' && (
                    <div className="flex justify-end">
                        <Badge status={agendamento.status} />
                    </div>
                )}

                {(podeEditar || podeCancelar) && (
                    <div className="flex items-center gap-2 border-t border-white/10 pt-3">
                        {podeEditar && (
                            <Button
                                variant="outline"
                                className="min-h-7 rounded-full px-4 py-1 text-xs font-semibold hover:scale-105"
                                onClick={() => onEditar(agendamento.id)}
                            >
                                Editar
                            </Button>
                        )}

                        {podeCancelar && (
                            <Button
                                variant="danger"
                                className="min-h-7 rounded-full px-4 py-1 text-xs font-semibold hover:scale-105"
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

            {confirmacaoConclusaoAberta && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
                    onClick={fecharConfirmacaoConclusao}
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
                            Concluir agendamento
                        </h2>

                        <p className="text-sm text-[var(--color-text-secondary)]">
                            Marcar agendamento como concluído? Isso irá
                            decrementar 1 crédito do pacote de{' '}
                            <span className="font-semibold text-[var(--color-text-primary)]">
                                {agendamento.cliente.nome}
                            </span>
                            .
                        </p>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                variant="primary"
                                fullWidth
                                className="sm:w-auto"
                                type="button"
                                onClick={() => void confirmarConclusao()}
                                disabled={concluindo}
                            >
                                {concluindo ? 'Concluindo...' : 'Confirmar'}
                            </Button>
                            <Button
                                variant="ghost"
                                fullWidth
                                className="sm:w-auto"
                                type="button"
                                onClick={fecharConfirmacaoConclusao}
                                disabled={concluindo}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </li>
    );
}
