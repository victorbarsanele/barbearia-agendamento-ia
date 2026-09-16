import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTimePicker } from '../components/DateTimePicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TimeTextInput } from '../components/TimeTextInput';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import {
    criarBloqueio,
    excluirBloqueio,
    listarBloqueios,
    type BloqueioHorario,
} from '../services/bloqueios.service';
import {
    createBrazilDate,
    getBrazilDateKey,
    getBrazilDateParts,
} from '../utils/dateTime';

function formatarDataHora(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatarHorario(value: string): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatarIntervalo(
    dataHoraInicio: string | null,
    dataHoraFim: string | null,
): string {
    if (!dataHoraInicio || !dataHoraFim) return 'Recorrência semanal';
    const mesmaData =
        getBrazilDateKey(new Date(dataHoraInicio)) ===
        getBrazilDateKey(new Date(dataHoraFim));

    if (mesmaData) {
        return `${formatarDataHora(dataHoraInicio)} - ${formatarHorario(dataHoraFim)}`;
    }

    return `${formatarDataHora(dataHoraInicio)} até ${formatarDataHora(dataHoraFim)}`;
}

function toIso(date: Date): string {
    return date.toISOString();
}

function combineDateAndTime(date: Date, time: Date): Date {
    const dateParts = getBrazilDateParts(date);
    const timeParts = getBrazilDateParts(time);

    return createBrazilDate(
        dateParts.year,
        dateParts.monthIndex,
        dateParts.day,
        Number(timeParts.hour),
        Number(timeParts.minute),
    );
}

function horaParaMinutos(hora: string): number {
    const [horas, minutos] = hora.split(':').map(Number);
    return horas * 60 + minutos;
}

function minutosParaHora(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return `${String(horas).padStart(2, '0')}:${String(minutosRestantes).padStart(2, '0')}`;
}

export function BloqueiosPage() {
    const navigate = useNavigate();
    const [bloqueios, setBloqueios] = useState<BloqueioHorario[]>([]);
    const [inicio, setInicio] = useState<Date | null>(null);
    const [fim, setFim] = useState<Date | null>(null);
    const [atravessaDias, setAtravessaDias] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [escopo, setEscopo] = useState<'TODOS' | 'SO_PAINEL'>('TODOS');
    const [recorrencia, setRecorrencia] = useState<'PONTUAL' | 'SEMANAL'>(
        'PONTUAL',
    );
    const [diaSemana, setDiaSemana] = useState(1);
    const [horaInicioSemanal, setHoraInicioSemanal] = useState('09:00');
    const [horaFimSemanal, setHoraFimSemanal] = useState('10:00');
    const [loading, setLoading] = useState(true);
    const [submetendo, setSubmetendo] = useState(false);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);
    const [pendenteExclusao, setPendenteExclusao] =
        useState<BloqueioHorario | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    useEffect(() => {
        let ativo = true;

        void listarBloqueios()
            .then((resultado) => {
                if (ativo) setBloqueios(resultado);
            })
            .catch((error) => {
                if (ativo) {
                    setErro(
                        error instanceof Error
                            ? error.message
                            : 'Não foi possível carregar os bloqueios.',
                    );
                }
            })
            .finally(() => {
                if (ativo) setLoading(false);
            });

        return () => {
            ativo = false;
        };
    }, []);

    const podeSalvar =
        recorrencia === 'SEMANAL'
            ? Boolean(motivo.trim() && horaFimSemanal > horaInicioSemanal)
            : Boolean(
                  inicio &&
                  fim &&
                  motivo.trim() &&
                  fim.getTime() > inicio.getTime(),
              );

    const bloqueiosOrdenados = useMemo(
        () =>
            [...bloqueios].sort(
                (a, b) =>
                    new Date(a.dataHoraInicio ?? 0).getTime() -
                    new Date(b.dataHoraInicio ?? 0).getTime(),
            ),
        [bloqueios],
    );

    const handleInicioChange = (date: Date) => {
        setInicio(date);

        if (!atravessaDias) {
            setFim((current) =>
                current ? combineDateAndTime(date, current) : date,
            );
        }
    };

    const handleFimChange = (date: Date) => {
        setFim(
            atravessaDias || !inicio ? date : combineDateAndTime(inicio, date),
        );
    };

    const handleAtravessaDiasChange = (checked: boolean) => {
        setAtravessaDias(checked);

        if (!checked && inicio) {
            setFim((current) =>
                current ? combineDateAndTime(inicio, current) : inicio,
            );
        }
    };

    const handleCriar = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!podeSalvar || (recorrencia === 'PONTUAL' && (!inicio || !fim)))
            return;

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);
        try {
            const novo = await criarBloqueio({
                ...(recorrencia === 'PONTUAL' && inicio && fim
                    ? { dataHoraInicio: toIso(inicio), dataHoraFim: toIso(fim) }
                    : {}),
                motivo: motivo.trim(),
                escopo,
                recorrencia,
                ...(recorrencia === 'SEMANAL'
                    ? {
                          diaSemana,
                          horaInicioMinutos:
                              Number(horaInicioSemanal.slice(0, 2)) * 60 +
                              Number(horaInicioSemanal.slice(3)),
                          horaFimMinutos:
                              Number(horaFimSemanal.slice(0, 2)) * 60 +
                              Number(horaFimSemanal.slice(3)),
                      }
                    : {}),
            });
            setBloqueios((current) => [...current, novo]);
            setInicio(null);
            setFim(null);
            setMotivo('');
            setAtravessaDias(false);
            setSucesso('Bloqueio criado com sucesso.');
        } catch (error) {
            setErro(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível criar o bloqueio.',
            );
        } finally {
            setSubmetendo(false);
        }
    };

    const handleExcluir = async () => {
        if (!pendenteExclusao) return;
        setExcluindoId(pendenteExclusao.id);
        setErro(null);
        try {
            await excluirBloqueio(pendenteExclusao.id);
            setBloqueios((current) =>
                current.filter((item) => item.id !== pendenteExclusao.id),
            );
            setSucesso('Bloqueio excluído com sucesso.');
        } catch (error) {
            setErro(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível excluir o bloqueio.',
            );
        } finally {
            setExcluindoId(null);
            setPendenteExclusao(null);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 pb-20 sm:p-6 sm:pb-24">
            <header className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h1
                        className="text-[34px] font-bold leading-none text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Bloqueios
                    </h1>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        Horários indisponíveis para clientes.
                    </p>
                </div>
                <Button
                    variant="ghost"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => navigate('/')}
                >
                    Voltar
                </Button>
            </header>

            {!loading && bloqueiosOrdenados.length === 0 && (
                <Card className="mb-5">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Nenhum bloqueio cadastrado.
                    </p>
                </Card>
            )}
            {!loading && bloqueiosOrdenados.length > 0 && (
                <div className="mb-5 space-y-3">
                    {bloqueiosOrdenados.map((bloqueio) => (
                        <Card
                            key={bloqueio.id}
                            className="flex items-center justify-between gap-3 bg-[var(--color-surface-elevated)]"
                        >
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                    {bloqueio.recorrencia === 'SEMANAL'
                                        ? `Toda ${['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'][bloqueio.diaSemana ?? 0]} (${String(Math.floor((bloqueio.horaInicioMinutos ?? 0) / 60)).padStart(2, '0')}:${String((bloqueio.horaInicioMinutos ?? 0) % 60).padStart(2, '0')} - ${String(Math.floor((bloqueio.horaFimMinutos ?? 0) / 60)).padStart(2, '0')}:${String((bloqueio.horaFimMinutos ?? 0) % 60).padStart(2, '0')})`
                                        : formatarIntervalo(
                                              bloqueio.dataHoraInicio,
                                              bloqueio.dataHoraFim,
                                          )}
                                </p>
                                <p className="mt-1 text-xs text-[var(--color-gold)]">
                                    {bloqueio.escopo === 'SO_PAINEL'
                                        ? 'Só painel'
                                        : 'Todos'}
                                </p>
                                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                    {bloqueio.motivo}
                                </p>
                            </div>
                            <Button
                                variant="danger"
                                className="min-h-8 px-3 text-xs"
                                disabled={excluindoId === bloqueio.id}
                                onClick={() => setPendenteExclusao(bloqueio)}
                            >
                                Excluir
                            </Button>
                        </Card>
                    ))}
                </div>
            )}

            <Card className="mb-5 bg-[var(--color-surface-elevated)]">
                <form
                    className="space-y-4"
                    onSubmit={(event) => void handleCriar(event)}
                >
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm text-[var(--color-text-secondary)]">
                            Escopo
                            <select
                                value={escopo}
                                onChange={(event) =>
                                    setEscopo(
                                        event.target.value as
                                            | 'TODOS'
                                            | 'SO_PAINEL',
                                    )
                                }
                                className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                            >
                                <option value="TODOS">
                                    Bloquear para todos
                                </option>
                                <option value="SO_PAINEL">
                                    Bloquear só das sugestões do Gemini
                                </option>
                            </select>
                        </label>
                        <label className="text-sm text-[var(--color-text-secondary)]">
                            Recorrência
                            <select
                                value={recorrencia}
                                onChange={(event) =>
                                    setRecorrencia(
                                        event.target.value as
                                            | 'PONTUAL'
                                            | 'SEMANAL',
                                    )
                                }
                                className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                            >
                                <option value="PONTUAL">Data específica</option>
                                <option value="SEMANAL">Toda semana</option>
                            </select>
                        </label>
                    </div>
                    {recorrencia === 'SEMANAL' && (
                        <div className="grid gap-4 sm:grid-cols-3">
                            <label className="text-sm text-[var(--color-text-secondary)]">
                                Dia
                                <select
                                    value={diaSemana}
                                    onChange={(event) =>
                                        setDiaSemana(Number(event.target.value))
                                    }
                                    className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                                >
                                    {[
                                        'Segunda',
                                        'Terça',
                                        'Quarta',
                                        'Quinta',
                                        'Sexta',
                                        'Sábado',
                                    ].map((dia, index) => (
                                        <option key={dia} value={index + 1}>
                                            {dia}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-sm text-[var(--color-text-secondary)]">
                                Início
                                <TimeTextInput
                                    value={horaParaMinutos(horaInicioSemanal)}
                                    onChange={(valor) =>
                                        setHoraInicioSemanal(
                                            minutosParaHora(valor),
                                        )
                                    }
                                    className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                                />
                            </label>
                            <label className="text-sm text-[var(--color-text-secondary)]">
                                Fim
                                <TimeTextInput
                                    value={horaParaMinutos(horaFimSemanal)}
                                    onChange={(valor) =>
                                        setHoraFimSemanal(
                                            minutosParaHora(valor),
                                        )
                                    }
                                    className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                                />
                            </label>
                        </div>
                    )}
                    {recorrencia === 'PONTUAL' && (
                        <>
                            <div>
                                <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
                                    Data
                                </p>
                                <DateTimePicker
                                    value={inicio}
                                    onChange={handleInicioChange}
                                    className="[&>div:last-child]:hidden"
                                    labels={{
                                        dateTitle: 'SELECIONE A DATA',
                                        timeTitle: 'SELECIONE O INÍCIO',
                                    }}
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
                                        Início
                                    </p>
                                    <DateTimePicker
                                        value={inicio}
                                        onChange={handleInicioChange}
                                        className="[&>div:first-child]:hidden"
                                        labels={{
                                            dateTitle: 'SELECIONE A DATA',
                                            timeTitle: 'SELECIONE O INÍCIO',
                                        }}
                                    />
                                </div>
                                {!atravessaDias && (
                                    <div>
                                        <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
                                            Fim
                                        </p>
                                        <DateTimePicker
                                            value={fim}
                                            onChange={handleFimChange}
                                            className="[&>div:first-child]:hidden"
                                            labels={{
                                                dateTitle: 'SELECIONE A DATA',
                                                timeTitle: 'SELECIONE O FIM',
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            <Checkbox
                                checked={atravessaDias}
                                onChange={handleAtravessaDiasChange}
                            >
                                Bloqueio atravessa mais de um dia?
                            </Checkbox>

                            {atravessaDias && (
                                <div>
                                    <p className="mb-2 text-sm font-medium text-[var(--color-text-secondary)]">
                                        Data de fim
                                    </p>
                                    <DateTimePicker
                                        value={fim}
                                        onChange={handleFimChange}
                                        className="[&>div:last-child]:hidden"
                                        labels={{
                                            dateTitle:
                                                'SELECIONE A DATA DE FIM',
                                            timeTitle: 'SELECIONE O FIM',
                                        }}
                                    />
                                    <div className="mt-2">
                                        <DateTimePicker
                                            value={fim}
                                            onChange={handleFimChange}
                                            className="[&>div:first-child]:hidden"
                                            labels={{
                                                dateTitle:
                                                    'SELECIONE A DATA DE FIM',
                                                timeTitle: 'SELECIONE O FIM',
                                            }}
                                        />
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <div>
                        <label
                            htmlFor="motivo"
                            className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]"
                        >
                            Motivo
                        </label>
                        <input
                            id="motivo"
                            value={motivo}
                            maxLength={120}
                            onChange={(event) => setMotivo(event.target.value)}
                            required
                            className="min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-gold)]"
                            placeholder="Ex.: Consulta médica"
                        />
                    </div>
                    {inicio && fim && fim.getTime() <= inicio.getTime() && (
                        <p className="text-sm text-[var(--color-danger)]">
                            Fim deve ser posterior ao início.
                        </p>
                    )}
                    <Button
                        type="submit"
                        fullWidth
                        disabled={!podeSalvar || submetendo}
                    >
                        {submetendo ? 'Salvando...' : 'Criar bloqueio'}
                    </Button>
                </form>
            </Card>

            {erro && (
                <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                    {erro}
                </div>
            )}
            {sucesso && (
                <div className="mb-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
                    {sucesso}
                </div>
            )}
            {loading && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                    Carregando...
                </p>
            )}
            <ConfirmDialog
                open={Boolean(pendenteExclusao)}
                title="Confirmar exclusão"
                description={
                    pendenteExclusao
                        ? `Deseja excluir o bloqueio ${pendenteExclusao.motivo}?`
                        : ''
                }
                confirmText="Excluir"
                loading={Boolean(excluindoId)}
                onCancel={() => setPendenteExclusao(null)}
                onConfirm={() => void handleExcluir()}
            />
        </main>
    );
}
