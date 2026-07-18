import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    criarAgendamento,
    type CriarAgendamentoPayload,
} from '../services/agendamentos.service';
import {
    buscarClientesPorNome,
    type Cliente,
} from '../services/clientes.service';
import { listarServicos, type Servico } from '../services/servicos.service';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DateTimePicker } from '../components/DateTimePicker';
import { getBrazilDateParts } from '../utils/dateTime';

const DEBOUNCE_MS = 300;
function toIsoWithBrasiliaOffset(data: string, hora: string): string {
    return `${data}T${hora}:00-03:00`;
}

function getHojeEmBrasiliaParaInput(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';

    return `${year}-${month}-${day}`;
}

function calcularDataHoraNoPassado(data: string, hora: string): boolean {
    if (!data || !hora) {
        return false;
    }

    const timestamp = new Date(toIsoWithBrasiliaOffset(data, hora)).getTime();
    if (Number.isNaN(timestamp)) {
        return false;
    }

    return timestamp < Date.now();
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

export function NovoAgendamentoPage() {
    const navigate = useNavigate();

    const [queryCliente, setQueryCliente] = useState('');
    const [clienteSelecionado, setClienteSelecionado] =
        useState<Cliente | null>(null);
    const [clientesSugeridos, setClientesSugeridos] = useState<Cliente[]>([]);
    const [buscandoClientes, setBuscandoClientes] = useState(false);

    const [servicos, setServicos] = useState<Servico[]>([]);
    const [servicoId, setServicoId] = useState('');

    const [data, setData] = useState('');
    const [horaSelecionada, setHoraSelecionada] = useState('');
    const [minutoSelecionado, setMinutoSelecionado] = useState('');
    const [dataHoraNoPassado, setDataHoraNoPassado] = useState(false);

    const [loadingServicos, setLoadingServicos] = useState(true);
    const [submetendo, setSubmetendo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    const fieldClassName =
        'h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]';

    const redirectTimeoutRef = useRef<number | null>(null);
    const minData = useMemo(() => getHojeEmBrasiliaParaInput(), []);
    const minDataDate = useMemo(
        () => new Date(`${minData}T12:00:00-03:00`),
        [minData],
    );
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
        let ativo = true;

        const carregarServicos = async () => {
            try {
                const lista = await listarServicos();
                if (!ativo) {
                    return;
                }

                setServicos(lista);
                if (lista.length > 0) {
                    setServicoId(lista[0].id);
                }
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os serviços.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoadingServicos(false);
                }
            }
        };

        void carregarServicos();

        return () => {
            ativo = false;
        };
    }, []);

    useEffect(() => {
        const termo = queryCliente.trim().toLowerCase();
        let ativo = true;

        if (!termo) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            const buscar = async () => {
                setBuscandoClientes(true);

                try {
                    const lista = await buscarClientesPorNome(termo);
                    if (!ativo) {
                        return;
                    }

                    setClientesSugeridos(lista);
                } catch (error) {
                    if (!ativo) {
                        return;
                    }

                    const message =
                        error instanceof Error
                            ? error.message
                            : 'Não foi possível buscar clientes.';
                    setErro(message);
                    setClientesSugeridos([]);
                } finally {
                    if (ativo) {
                        setBuscandoClientes(false);
                    }
                }
            };

            void buscar();
        }, DEBOUNCE_MS);

        return () => {
            ativo = false;
            window.clearTimeout(timeoutId);
        };
    }, [queryCliente]);

    useEffect(() => {
        return () => {
            if (redirectTimeoutRef.current !== null) {
                window.clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, []);

    const podeEnviar = useMemo(() => {
        return (
            !!clienteSelecionado?.id &&
            !!servicoId &&
            !!data &&
            !!hora &&
            !dataHoraNoPassado &&
            !submetendo &&
            !loadingServicos
        );
    }, [
        clienteSelecionado?.id,
        data,
        dataHoraNoPassado,
        hora,
        loadingServicos,
        servicoId,
        submetendo,
    ]);

    const handleSelecionarCliente = (cliente: Cliente) => {
        setClienteSelecionado(cliente);
        setQueryCliente(cliente.nome);
        setClientesSugeridos([]);
        setErro(null);
        setSucesso(null);
    };

    const handleChangeCliente = (value: string) => {
        setQueryCliente(value);
        setErro(null);
        setSucesso(null);

        if (!value.trim()) {
            setClientesSugeridos([]);
            setBuscandoClientes(false);
        }

        if (clienteSelecionado?.nome !== value) {
            setClienteSelecionado(null);
        }
    };

    const limparClienteSelecionado = () => {
        setClienteSelecionado(null);
        setQueryCliente('');
        setClientesSugeridos([]);
        setBuscandoClientes(false);
        setErro(null);
        setSucesso(null);
    };

    const handleChangeDataHora = (nextDate: Date) => {
        const parts = getBrazilDateParts(nextDate);
        const nextData = `${String(parts.year).padStart(4, '0')}-${String(
            parts.monthIndex + 1,
        ).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
        const nextHora = `${parts.hour}:${parts.minute}`;

        setData(nextData);
        setHoraSelecionada(parts.hour);
        setMinutoSelecionado(parts.minute);
        setDataHoraNoPassado(calcularDataHoraNoPassado(nextData, nextHora));
        setErro(null);
        setSucesso(null);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!clienteSelecionado?.id) {
            setErro('Selecione um cliente da lista de sugestões.');
            return;
        }

        if (!servicoId || !data || !hora) {
            setErro('Preencha todos os campos obrigatórios.');
            return;
        }

        const horarioNoPassado = calcularDataHoraNoPassado(data, hora);
        setDataHoraNoPassado(horarioNoPassado);

        if (horarioNoPassado) {
            setErro('Selecione uma data e hora futuras para o agendamento.');
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);

        const payload: CriarAgendamentoPayload = {
            clienteId: clienteSelecionado.id,
            servicoId,
            dataHoraInicio: toIsoWithBrasiliaOffset(data, hora),
        };

        try {
            await criarAgendamento(payload);
            setSucesso('Agendamento criado com sucesso! Redirecionando...');
            redirectTimeoutRef.current = window.setTimeout(() => {
                navigate('/');
            }, 1200);
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível criar o agendamento.';
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
                    Novo agendamento
                </h1>
            </header>

            <Card className="bg-[var(--color-surface-elevated)]">
                <form
                    onSubmit={(event) => {
                        void handleSubmit(event);
                    }}
                    className="space-y-5"
                >
                    <div>
                        <label
                            htmlFor="cliente"
                            className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Buscar cliente
                        </label>
                        <input
                            id="cliente"
                            type="text"
                            value={queryCliente}
                            onChange={(event) =>
                                handleChangeCliente(event.target.value)
                            }
                            placeholder="Digite o nome do cliente"
                            autoComplete="off"
                            className={fieldClassName}
                        />

                        {buscandoClientes && (
                            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                                Buscando clientes...
                            </p>
                        )}

                        {clienteSelecionado && (
                            <div className="mt-3 flex items-center justify-between gap-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                                        Cliente selecionado
                                    </p>
                                    <p className="truncate text-sm font-semibold text-[var(--color-gold)]">
                                        {clienteSelecionado.nome}
                                    </p>
                                    <p className="truncate text-sm text-[var(--color-text-secondary)]">
                                        {clienteSelecionado.telefone}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={limparClienteSelecionado}
                                    className="min-h-8 shrink-0 px-2.5 text-xs"
                                >
                                    Trocar
                                </Button>
                            </div>
                        )}

                        {!buscandoClientes &&
                            queryCliente.trim() &&
                            !clienteSelecionado && (
                                <ul className="mt-2 max-h-56 overflow-auto rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)]">
                                    {clientesSugeridos.map((cliente) => (
                                        <li key={cliente.id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleSelecionarCliente(
                                                        cliente,
                                                    )
                                                }
                                                className="w-full px-3 py-2 text-left text-sm text-[var(--color-text-primary)] transition hover:bg-[var(--color-gold)]/15"
                                            >
                                                <span className="font-medium text-[var(--color-gold)]">
                                                    {cliente.nome}
                                                </span>
                                                <span className="ml-2 text-[var(--color-text-secondary)]">
                                                    {cliente.telefone}
                                                </span>
                                            </button>
                                        </li>
                                    ))}

                                    {clientesSugeridos.length === 0 && (
                                        <li className="px-3 py-2 text-sm text-[var(--color-text-secondary)]">
                                            Nenhum cliente encontrado.
                                        </li>
                                    )}
                                </ul>
                            )}
                    </div>

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
                            disabled={loadingServicos || servicos.length === 0}
                            className={`${fieldClassName} disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                            {servicos.length === 0 ? (
                                <option value="">
                                    Sem serviços disponíveis
                                </option>
                            ) : (
                                servicos.map((servico) => (
                                    <option key={servico.id} value={servico.id}>
                                        {servico.nome} ({servico.duracaoMinutos}{' '}
                                        min) — {formatarPreco(servico.preco)}
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
                            onChange={handleChangeDataHora}
                            minDate={minDataDate}
                            labels={{
                                dateTitle: 'SELECIONE UMA DATA',
                                timeTitle: 'SELECIONE UM HORÁRIO',
                            }}
                        />
                    </div>

                    {data && hora && dataHoraNoPassado && (
                        <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                            O horário selecionado já passou. Escolha uma
                            data/hora futura.
                        </div>
                    )}

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
                        disabled={!podeEnviar}
                        className="min-h-12"
                    >
                        {submetendo ? 'Salvando...' : 'Salvar agendamento'}
                    </Button>
                </form>
            </Card>
        </main>
    );
}
