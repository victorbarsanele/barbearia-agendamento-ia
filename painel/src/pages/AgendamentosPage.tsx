import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AgendamentoItem } from '../components/AgendamentoItem';
import { CalendarGrid } from '../components/CalendarGrid.tsx';
import { SkeletonCard } from '../components/SkeletonCard';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import {
    cancelarAgendamento,
    listarAgendamentos,
    type Agendamento,
} from '../services/agendamentos.service';

const TIME_ZONE = 'America/Sao_Paulo';

function getDateKeyEmBrasilia(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });

    return formatter.format(date);
}

function isMesmaDataEmBrasilia(
    isoDate: string,
    selectedDateKey: string,
): boolean {
    return getDateKeyEmBrasilia(new Date(isoDate)) === selectedDateKey;
}

function addDaysToDateKey(dateKey: string, days: number): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));

    const nextYear = date.getUTCFullYear();
    const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
    const nextDay = String(date.getUTCDate()).padStart(2, '0');

    return `${nextYear}-${nextMonth}-${nextDay}`;
}

function formatarDataCompleta(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    const formatter = new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });

    const text = formatter.format(date);

    return text.charAt(0).toUpperCase() + text.slice(1);
}

function getHojeDateKey(): string {
    return getDateKeyEmBrasilia(new Date());
}

function isDateKeyValida(value: string | null): value is string {
    if (!value) {
        return false;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
    );
}

export function AgendamentosPage() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [searchParams] = useSearchParams();

    const dataParam = searchParams.get('data');
    const dataInicial = isDateKeyValida(dataParam)
        ? dataParam
        : getHojeDateKey();

    const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [erro, setErro] = useState<string | null>(null);
    const [cancelandoId, setCancelandoId] = useState<string | null>(null);
    const [dataSelecionadaKey, setDataSelecionadaKey] =
        useState<string>(dataInicial);
    const [calendarioAberto, setCalendarioAberto] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const carregarPorData = async () => {
            setLoading(true);
            setErro(null);

            try {
                const data = await listarAgendamentos();
                if (isMounted) {
                    setAgendamentos(data);
                }
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os agendamentos.';
                setErro(message);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        void carregarPorData();

        return () => {
            isMounted = false;
        };
    }, [dataSelecionadaKey]);

    const dataSelecionadaLabel = useMemo(
        () => formatarDataCompleta(dataSelecionadaKey),
        [dataSelecionadaKey],
    );

    const agendamentosDoDia = useMemo(() => {
        return agendamentos
            .filter((item) =>
                isMesmaDataEmBrasilia(item.dataHoraInicio, dataSelecionadaKey),
            )
            .sort(
                (a, b) =>
                    new Date(a.dataHoraInicio).getTime() -
                    new Date(b.dataHoraInicio).getTime(),
            );
    }, [agendamentos, dataSelecionadaKey]);

    const handleCancelar = useCallback(
        async (id: string, notificarCliente: boolean) => {
            setCancelandoId(id);
            setErro(null);

            try {
                const agendamentoCancelado = await cancelarAgendamento(id, {
                    notificarCliente,
                });
                setAgendamentos((current) =>
                    current.map((agendamento) =>
                        agendamento.id === agendamentoCancelado.id
                            ? agendamentoCancelado
                            : agendamento,
                    ),
                );
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível cancelar o agendamento.';
                setErro(message);
            } finally {
                setCancelandoId(null);
            }
        },
        [],
    );

    const handleDiaAnterior = useCallback(() => {
        setDataSelecionadaKey((current) => addDaysToDateKey(current, -1));
    }, []);

    const handleProximoDia = useCallback(() => {
        setDataSelecionadaKey((current) => addDaysToDateKey(current, 1));
    }, []);

    const handleIrParaHoje = useCallback(() => {
        setDataSelecionadaKey(getHojeDateKey());
    }, []);

    const handleSelecionarData = useCallback((dateKey: string) => {
        setDataSelecionadaKey(dateKey);
        setCalendarioAberto(false);
    }, []);

    const handleEditar = useCallback(
        (id: string) => {
            navigate(`/editar/${id}`);
        },
        [navigate],
    );

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] px-4 py-5 pb-20 sm:px-6 sm:py-6 sm:pb-24">
            <header className="mb-5 space-y-4">
                <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h1
                                className="text-[34px] font-bold leading-none text-[var(--color-gold)]"
                                style={{ fontFamily: 'var(--font-title)' }}
                            >
                                Agenda
                            </h1>
                            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                                Horário de Brasília
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                className="min-h-9 px-3 text-xs"
                                onClick={() => navigate('/novo')}
                            >
                                Novo agendamento
                            </Button>
                            <Button
                                variant="ghost"
                                className="min-h-9 px-3 text-xs"
                                onClick={() => {
                                    void logout();
                                }}
                            >
                                Sair
                            </Button>
                        </div>
                    </div>

                    {calendarioAberto && (
                        <div className="absolute left-0 right-0 top-full z-20 mt-3">
                            <div className="rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.42)]">
                                <CalendarGrid
                                    key={dataSelecionadaKey}
                                    valueKey={dataSelecionadaKey}
                                    onChange={handleSelecionarData}
                                    labels={{ title: 'Selecione uma data' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="rounded-[12px] bg-[var(--color-surface-elevated)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
                    <div className="flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() =>
                                setCalendarioAberto((current) => !current)
                            }
                            aria-label="Abrir calendário"
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-gold)] transition hover:border-[var(--color-gold)]"
                        >
                            <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <rect
                                    x="3.5"
                                    y="5.5"
                                    width="17"
                                    height="15"
                                    rx="2"
                                />
                                <path d="M8 3.5v4" />
                                <path d="M16 3.5v4" />
                                <path d="M3.5 9.5h17" />
                            </svg>
                        </button>

                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {dataSelecionadaLabel}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="ghost"
                            className="min-h-8 px-2.5 text-xs"
                            onClick={handleDiaAnterior}
                        >
                            Anterior
                        </Button>
                        <Button
                            variant="ghost"
                            className="min-h-8 px-2.5 text-xs"
                            onClick={handleIrParaHoje}
                        >
                            Hoje
                        </Button>
                        <Button
                            variant="ghost"
                            className="min-h-8 px-2.5 text-xs"
                            onClick={handleProximoDia}
                        >
                            Próximo
                        </Button>
                    </div>
                </div>
            </header>

            {loading && (
                <SkeletonCard
                    variant="agendamento"
                    count={4}
                    heightClassName="min-h-[152px]"
                />
            )}

            {erro && (
                <div className="mb-4 rounded-[12px] border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4 text-sm text-[#fca5a5]">
                    {erro}
                </div>
            )}

            {!loading && agendamentosDoDia.length === 0 && (
                <div className="rounded-[12px] bg-[var(--color-surface-elevated)] p-4 text-sm text-[var(--color-text-secondary)] shadow-[0_8px_24px_rgba(0,0,0,0.28)]">
                    Nenhum agendamento para a data selecionada.
                </div>
            )}

            {!loading && agendamentosDoDia.length > 0 && (
                <ul className="space-y-3">
                    {agendamentosDoDia.map((agendamento) => (
                        <AgendamentoItem
                            key={agendamento.id}
                            agendamento={agendamento}
                            onEditar={handleEditar}
                            onCancelar={handleCancelar}
                            cancelando={cancelandoId === agendamento.id}
                        />
                    ))}
                </ul>
            )}
        </main>
    );
}
