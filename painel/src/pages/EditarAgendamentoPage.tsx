import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    atualizarAgendamento,
    buscarAgendamentoPorId,
    type Agendamento,
} from '../services/agendamentos.service';
import { listarServicos, type Servico } from '../services/servicos.service';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DateTimePicker } from '../components/DateTimePicker';
import { getBrazilDateParts } from '../utils/dateTime';

const TIME_ZONE = 'America/Sao_Paulo';
function toIsoWithBrasiliaOffset(data: string, hora: string): string {
    return `${data}T${hora}:00-03:00`;
}

function getDateTimePartsEmBrasilia(isoDate: string): {
    data: string;
    hora: string;
} {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(new Date(isoDate));

    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';

    return {
        data: `${year}-${month}-${day}`,
        hora: `${hour}:${minute}`,
    };
}

function formatarDataHoraEmBrasilia(isoDate: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: TIME_ZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(new Date(isoDate));
}

function formatarPreco(valor: string | null): string {
    if (valor === null) {
        return 'Consultar';
    }

    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
        return 'Consultar';
    }

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numero);
}

export function EditarAgendamentoPage() {
    const navigate = useNavigate();
    const { id = '' } = useParams<{ id: string }>();

    const [agendamento, setAgendamento] = useState<Agendamento | null>(null);
    const [servicos, setServicos] = useState<Servico[]>([]);

    const [servicoId, setServicoId] = useState('');
    const [data, setData] = useState('');
    const [horaSelecionada, setHoraSelecionada] = useState('');
    const [minutoSelecionado, setMinutoSelecionado] = useState('');
    const [notificarCliente, setNotificarCliente] = useState(false);

    const [loading, setLoading] = useState(true);
    const [submetendo, setSubmetendo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const fieldClassName =
        'h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]';

    const redirectTimeoutRef = useRef<number | null>(null);

    const dataHoraSelecionada = useMemo(
        () =>
            data && horaSelecionada && minutoSelecionado
                ? new Date(
                      `${data}T${horaSelecionada}:${minutoSelecionado}:00-03:00`,
                  )
                : null,
        [data, horaSelecionada, minutoSelecionado],
    );
    const hora = useMemo(() => {
        if (!horaSelecionada || !minutoSelecionado) {
            return '';
        }

        return `${horaSelecionada}:${minutoSelecionado}`;
    }, [horaSelecionada, minutoSelecionado]);

    useEffect(() => {
        return () => {
            if (redirectTimeoutRef.current !== null) {
                window.clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        let ativo = true;

        const carregarDados = async () => {
            if (!id) {
                if (ativo) {
                    setErro('ID do agendamento inválido.');
                    setLoading(false);
                }
                return;
            }

            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const [agendamentoResponse, servicosResponse] =
                    await Promise.all([
                        buscarAgendamentoPorId(id),
                        listarServicos(),
                    ]);

                if (!ativo) {
                    return;
                }

                const { data: dataInicial, hora: horaInicial } =
                    getDateTimePartsEmBrasilia(
                        agendamentoResponse.dataHoraInicio,
                    );

                setAgendamento(agendamentoResponse);
                setServicos(servicosResponse);
                setServicoId(agendamentoResponse.servico.id);
                setData(dataInicial);
                const [horaOnly, minutoOnly] = horaInicial.split(':');
                setHoraSelecionada(horaOnly ?? '');
                setMinutoSelecionado(minutoOnly ?? '');
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar o agendamento.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarDados();

        return () => {
            ativo = false;
        };
    }, [id]);

    const podeSalvar = useMemo(() => {
        return !!agendamento && !!servicoId && !!data && !!hora && !submetendo;
    }, [agendamento, servicoId, data, hora, submetendo]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!agendamento || !id) {
            setErro('Agendamento inválido para edição.');
            return;
        }

        if (!servicoId || !data || !hora) {
            setErro('Preencha serviço, data e hora para remarcar.');
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);

        try {
            await atualizarAgendamento(id, {
                clienteId: agendamento.cliente.id,
                servicoId,
                dataHoraInicio: toIsoWithBrasiliaOffset(data, hora),
                status: agendamento.status,
                notificarCliente,
            });
            setSucesso('Agendamento atualizado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível atualizar o agendamento.';
            setErro(message);
            setSucesso(null);
        } finally {
            setSubmetendo(false);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 sm:p-6">
            <header className="mb-6 flex items-center gap-3">
                <Button variant="ghost" onClick={() => navigate('/')}>
                    Voltar
                </Button>
                <h1
                    className="text-3xl font-bold text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    Editar agendamento
                </h1>
            </header>

            {loading && (
                <Card className="bg-[var(--color-surface-elevated)]">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Carregando agendamento...
                    </p>
                </Card>
            )}

            {!loading && (
                <Card>
                    <form
                        onSubmit={(event) => {
                            void handleSubmit(event);
                        }}
                        className="space-y-5"
                    >
                        {agendamento && (
                            <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm">
                                <p className="font-semibold text-[var(--color-gold)]">
                                    Cliente: {agendamento.cliente.nome}
                                </p>
                                <p className="mt-1 text-[var(--color-text-secondary)]">
                                    Horario atual:{' '}
                                    {formatarDataHoraEmBrasilia(
                                        agendamento.dataHoraInicio,
                                    )}
                                </p>
                            </div>
                        )}

                        <div>
                            <label
                                htmlFor="servico"
                                className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                            >
                                Serviço
                            </label>
                            <select
                                id="servico"
                                value={servicoId}
                                onChange={(event) =>
                                    setServicoId(event.target.value)
                                }
                                disabled={servicos.length === 0}
                                className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                                {servicos.length === 0 ? (
                                    <option value="">
                                        Sem serviços disponíveis
                                    </option>
                                ) : (
                                    servicos.map((servico) => (
                                        <option
                                            key={servico.id}
                                            value={servico.id}
                                        >
                                            {servico.nome} (
                                            {servico.duracaoMinutos} min) —{' '}
                                            {formatarPreco(servico.preco)}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        <div>
                            <label
                                htmlFor="data-hora"
                                className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                            >
                                Data e hora
                            </label>
                            <DateTimePicker
                                value={dataHoraSelecionada}
                                onChange={(nextDate: Date) => {
                                    const parts = getBrazilDateParts(nextDate);

                                    setData(
                                        `${String(parts.year).padStart(4, '0')}-${String(parts.monthIndex + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
                                    );
                                    setHoraSelecionada(parts.hour);
                                    setMinutoSelecionado(parts.minute);
                                }}
                                labels={{
                                    dateTitle: 'SELECIONE UMA NOVA DATA',
                                    timeTitle: 'SELECIONE UM NOVO HORÁRIO',
                                }}
                            />
                        </div>

                        <label className="flex items-start gap-3 text-sm text-[var(--color-text-secondary)]">
                            <input
                                type="checkbox"
                                checked={notificarCliente}
                                onChange={(event) =>
                                    setNotificarCliente(event.target.checked)
                                }
                                className="mt-0.5 h-4 w-4 accent-[var(--color-gold)]"
                            />
                            <span>
                                Notificar cliente sobre a mudança via WhatsApp
                            </span>
                        </label>

                        {erro && (
                            <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                                {erro}
                            </div>
                        )}

                        {sucesso && (
                            <div className="rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
                                {sucesso}
                            </div>
                        )}

                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            disabled={!podeSalvar}
                            className="min-h-12"
                        >
                            {submetendo ? 'Salvando...' : 'Salvar alterações'}
                        </Button>
                    </form>
                </Card>
            )}
        </main>
    );
}
