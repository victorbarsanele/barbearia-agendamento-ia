import { useState } from 'react';
import { Check, CheckCircle2, Clock, Package, Send } from 'lucide-react';
import type { Agendamento } from '../services/agendamentos.service';
import { formatarNumeroNoPacote } from '../utils/numeroNoPacote';
import { infoOrigemAgendamento } from '../utils/origemAgendamento.js';
import { podeCancelarAgendamento } from '../utils/podeCancelarAgendamento';
import { formatarPrecoBRL } from '../utils/preco';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { ConfirmDialog } from './ConfirmDialog';
import { IconButton } from './ui/IconButton';

interface AgendamentoItemProps {
    agendamento: Agendamento;
    valorVisivel: boolean;
    onEditar: (id: string) => void;
    onCancelar: (
        id: string,
        notificarCliente: boolean,
        aplicarParaLote: boolean,
    ) => Promise<void>;
    cancelando: boolean;
    onConcluir: (id: string, aplicarParaLote: boolean) => Promise<void>;
    concluindo: boolean;
    onEnviarLembrete: (id: string) => Promise<void>;
    enviandoLembrete: boolean;
    agora: number;
}

function formatarHora(isoDate: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(isoDate));
}

function formatarDataHora(isoDate: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(isoDate));
}

export function AgendamentoItem({
    agendamento,
    valorVisivel,
    onEditar,
    onCancelar,
    cancelando,
    onConcluir,
    concluindo,
    onEnviarLembrete,
    enviandoLembrete,
    agora,
}: AgendamentoItemProps) {
    const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
    const [confirmacaoConclusaoAberta, setConfirmacaoConclusaoAberta] =
        useState(false);
    const [notificarCliente, setNotificarCliente] = useState(false);
    const [aplicarParaLoteCancelar, setAplicarParaLoteCancelar] =
        useState(false);
    const [aplicarParaLoteConcluir, setAplicarParaLoteConcluir] =
        useState(false);
    const [confirmacaoLembreteAberta, setConfirmacaoLembreteAberta] =
        useState(false);

    const fazPartesDeLote = Boolean(agendamento.loteId);

    const podeCancelar = podeCancelarAgendamento(
        agendamento.status,
        agendamento.concluido,
        agendamento.estornavel,
    );
    const podeEditar = agendamento.status !== 'CANCELADO';
    const ehAgendamentoDePacote = Boolean(agendamento.pacoteClienteId);
    const podeConcluir = ehAgendamentoDePacote && !agendamento.concluido;
    const ehPacoteConcluido = ehAgendamentoDePacote && agendamento.concluido;
    const origemInfo = infoOrigemAgendamento(agendamento.origem);
    const ultimoLembrete = agendamento.ultimoLembrete;
    const lembreteAceito = ultimoLembrete?.status === 'ACEITO';
    const lembretePendente = ultimoLembrete?.status === 'PENDENTE';
    const podeEnviarLembrete =
        (agendamento.status === 'AGENDADO' ||
            agendamento.status === 'CONFIRMADO') &&
        new Date(agendamento.dataHoraInicio).getTime() > agora &&
        !lembreteAceito;

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
        await onCancelar(
            agendamento.id,
            notificarCliente,
            aplicarParaLoteCancelar,
        );
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
        await onConcluir(agendamento.id, aplicarParaLoteConcluir);
        setConfirmacaoConclusaoAberta(false);
    };

    const confirmarEnvioLembrete = async () => {
        await onEnviarLembrete(agendamento.id);
        setConfirmacaoLembreteAberta(false);
    };

    return (
        <li>
            <Card
                className={`relative space-y-4 rounded-[14px] bg-[var(--color-surface-elevated)] p-4 transition-opacity ${
                    ehPacoteConcluido || agendamento.status === 'CANCELADO'
                        ? 'opacity-60'
                        : ''
                }`}
            >
                <div className="flex items-start justify-between gap-3">
                    {origemInfo && (
                        <span
                            role="img"
                            aria-label={origemInfo.label}
                            title={origemInfo.label}
                            className={`pointer-events-none absolute -top-2 right-1.5 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border ${agendamento.origem === 'WHATSAPP_IA' ? 'border-[var(--color-gold)] bg-[var(--color-bg)] text-[var(--color-gold)]' : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'}`}
                        >
                            <origemInfo.Icon
                                aria-hidden="true"
                                className="h-3.5 w-3.5"
                            />
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        <p className="min-w-0 truncate text-base font-bold text-[var(--color-text-primary)]">
                            {agendamento.cliente.nome}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                            <span className="text-[var(--color-text-secondary)]">
                                {agendamento.servico.nome}
                            </span>
                            <span
                                aria-hidden="true"
                                className="text-[var(--color-text-secondary)]"
                            >
                                ·
                            </span>
                            <span className="text-[var(--color-text-secondary)]">
                                {agendamento.servico.duracaoMinutos} min
                            </span>
                            {!ehAgendamentoDePacote &&
                                agendamento.servico.preco && (
                                    <>
                                        <span
                                            aria-hidden="true"
                                            className="text-[var(--color-text-secondary)]"
                                        >
                                            ·
                                        </span>
                                        <span className="font-bold text-[var(--color-gold)]">
                                            {valorVisivel ? (
                                                formatarPrecoBRL(
                                                    agendamento.servico.preco,
                                                )
                                            ) : (
                                                <span aria-label="Valor do serviço oculto">
                                                    ••••
                                                </span>
                                            )}
                                        </span>
                                    </>
                                )}
                        </div>
                        {agendamento.concluidoPor === 'AUTOMATICO' && (
                            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
                                <CheckCircle2
                                    aria-hidden="true"
                                    className="h-3.5 w-3.5"
                                />
                                Concluído automaticamente
                            </span>
                        )}
                        {agendamento.autoConclusaoPendente && (
                            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                                Pendente de conclusão automática
                            </p>
                        )}
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
                                <IconButton
                                    ariaLabel="Marcar pacote como concluído"
                                    title="Marcar pacote como concluído"
                                    size="sm"
                                    variant="gold"
                                    onClick={abrirConfirmacaoConclusao}
                                    disabled={concluindo}
                                    className="rounded-full border-[var(--color-gold)]/35 bg-[var(--color-surface-elevated)] hover:scale-110"
                                >
                                    <Package className="h-5 w-5" />
                                </IconButton>
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

                {(podeEditar ||
                    podeCancelar ||
                    podeEnviarLembrete ||
                    lembreteAceito) && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                        {podeEditar && (
                            <Button
                                variant="ghost"
                                className="rounded-full px-4 text-sm font-semibold hover:scale-105"
                                onClick={() => onEditar(agendamento.id)}
                            >
                                Editar
                            </Button>
                        )}

                        {podeCancelar && (
                            <Button
                                variant="danger-soft"
                                className="rounded-full px-4 text-sm font-semibold hover:scale-105"
                                onClick={abrirConfirmacao}
                                disabled={cancelando}
                            >
                                {cancelando ? 'Cancelando...' : 'Cancelar'}
                            </Button>
                        )}

                        {lembreteAceito ? (
                            <span className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-[var(--color-success)]">
                                <CheckCircle2 className="h-4 w-4" />
                                Lembrete enviado às{' '}
                                {formatarHora(
                                    ultimoLembrete.aceitoEm ??
                                        ultimoLembrete.criadoEm,
                                )}
                            </span>
                        ) : (
                            podeEnviarLembrete && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        variant="outline"
                                        className="rounded-full px-3 text-sm font-semibold"
                                        onClick={() =>
                                            setConfirmacaoLembreteAberta(true)
                                        }
                                        disabled={
                                            enviandoLembrete || lembretePendente
                                        }
                                    >
                                        <Send
                                            aria-hidden="true"
                                            className="mr-1.5 h-4 w-4"
                                        />
                                        {enviandoLembrete
                                            ? 'Enviando...'
                                            : lembretePendente
                                              ? 'Lembrete em andamento'
                                              : ultimoLembrete?.status ===
                                                  'FALHOU'
                                                ? 'Tentar novamente'
                                                : 'Enviar lembrete'}
                                    </Button>
                                    {ultimoLembrete?.status === 'FALHOU' && (
                                        <span className="text-xs text-[var(--color-danger-text)]">
                                            Última tentativa falhou
                                        </span>
                                    )}
                                </div>
                            )
                        )}

                        {agendamento.status !== 'CANCELADO' &&
                            formatarNumeroNoPacote(
                                agendamento.numeroNoPacote,
                                agendamento.totalServicoNoPacote,
                            ) && (
                                <span className="ml-auto inline-flex w-fit items-center rounded-full bg-[var(--color-gold-muted)] px-2.5 py-1 text-xs font-semibold text-[var(--color-gold)]">
                                    {formatarNumeroNoPacote(
                                        agendamento.numeroNoPacote,
                                        agendamento.totalServicoNoPacote,
                                    )}
                                </span>
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
                            {agendamento.estornavel
                                ? 'Ao cancelar este agendamento, 1 crédito será devolvido ao pacote de '
                                : 'Tem certeza que deseja cancelar o agendamento de '}
                            <span className="font-semibold text-[var(--color-text-primary)]">
                                {agendamento.cliente.nome}
                            </span>
                            {agendamento.estornavel ? '.' : '?'}
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

                        {fazPartesDeLote && (
                            <label className="flex items-start gap-3 text-sm text-[var(--color-text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={aplicarParaLoteCancelar}
                                    onChange={(event) =>
                                        setAplicarParaLoteCancelar(
                                            event.target.checked,
                                        )
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
                                    Esse agendamento faz parte de uma sequência.
                                    Deseja aplicar esta alteração a todos os
                                    agendamentos da sequência também?
                                </span>
                            </label>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                variant="danger"
                                fullWidth
                                className="sm:w-auto"
                                type="button"
                                onClick={() => void confirmarCancelamento()}
                                disabled={cancelando}
                            >
                                {cancelando
                                    ? 'Cancelando...'
                                    : agendamento.estornavel
                                      ? 'Sim, cancelar e estornar crédito'
                                      : 'Sim, cancelar'}
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
                            descontar 1 crédito do pacote de{' '}
                            <span className="font-semibold text-[var(--color-text-primary)]">
                                {agendamento.cliente.nome}
                            </span>
                            .
                        </p>

                        {fazPartesDeLote && (
                            <label className="flex items-start gap-3 text-sm text-[var(--color-text-secondary)]">
                                <input
                                    type="checkbox"
                                    checked={aplicarParaLoteConcluir}
                                    onChange={(event) =>
                                        setAplicarParaLoteConcluir(
                                            event.target.checked,
                                        )
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
                                    Esse agendamento faz parte de uma sequência.
                                    Deseja aplicar esta alteração a todos os
                                    agendamentos da sequência também?
                                </span>
                            </label>
                        )}

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

            <ConfirmDialog
                open={confirmacaoLembreteAberta}
                title="Enviar lembrete"
                description="Confirme os dados antes de enviar o lembrete por WhatsApp."
                descriptionItems={[
                    `Cliente: ${agendamento.cliente.nome}`,
                    `Serviço: ${agendamento.servico.nome}`,
                    `Data e horário: ${formatarDataHora(agendamento.dataHoraInicio)}`,
                ]}
                confirmText="Enviar lembrete"
                loadingText="Enviando..."
                confirmVariant="primary"
                cancelVariant="ghost"
                loading={enviandoLembrete}
                onConfirm={() => void confirmarEnvioLembrete()}
                onCancel={() => setConfirmacaoLembreteAberta(false)}
            />
        </li>
    );
}
