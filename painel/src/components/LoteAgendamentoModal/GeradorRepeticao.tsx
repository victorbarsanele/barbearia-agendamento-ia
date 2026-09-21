import { useMemo, useState } from 'react';
import { DateKeyPicker } from '../DateKeyPicker';
import { TimePicker } from '../TimePicker';
import { Radio } from '../ui/Radio';
import { formatBrazilDateKey } from '../../utils/dateTime';
import {
    expandirRecorrencia,
    validarRecorrencia,
    type ResultadoExpansaoRecorrencia,
    type SlotLote,
} from './expandirRecorrencia';

interface GeradorRepeticaoProps {
    onGerar: (slots: SlotLote[]) => void;
    onAlterar: () => void;
    onErro: (mensagem: string | null) => void;
}

const DIAS_SEMANA = [
    { valor: 1, label: 'Seg' },
    { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' },
    { valor: 4, label: 'Qui' },
    { valor: 5, label: 'Sex' },
    { valor: 6, label: 'Sáb' },
];

const fieldClassName =
    'h-10 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]';

function getHojeEmBrasiliaParaInput(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    return parts;
}

export function GeradorRepeticao({
    onGerar,
    onAlterar,
    onErro,
}: GeradorRepeticaoProps) {
    const [diasSelecionados, setDiasSelecionados] = useState<Set<number>>(
        new Set(),
    );
    const [horarioPorDia, setHorarioPorDia] = useState<Record<number, string>>(
        {},
    );
    const [dataInicial, setDataInicial] = useState(
        getHojeEmBrasiliaParaInput(),
    );
    const [criterioParada, setCriterioParada] = useState<
        'data' | 'ocorrencias'
    >('ocorrencias');
    const [dataFinal, setDataFinal] = useState('');
    const [numeroOcorrencias, setNumeroOcorrencias] = useState(4);
    const [repeticao, setRepeticao] = useState<'1' | '2' | 'personalizado'>(
        '1',
    );
    const [intervaloPersonalizado, setIntervaloPersonalizado] = useState(3);
    const [resultado, setResultado] = useState<
        ResultadoExpansaoRecorrencia | null
    >(null);

    const intervaloSemanas =
        repeticao === 'personalizado'
            ? intervaloPersonalizado
            : Number(repeticao);

    const limparResultado = () => {
        setResultado(null);
        onGerar([]);
        onAlterar();
        onErro(null);
    };

    const toggleDia = (dia: number) => {
        limparResultado();
        setDiasSelecionados((current) => {
            const proximo = new Set(current);
            if (proximo.has(dia)) {
                proximo.delete(dia);
            } else {
                proximo.add(dia);
            }
            return proximo;
        });
    };

    const podeGerar = useMemo(() => {
        if (criterioParada === 'data') {
            return !!dataFinal;
        }

        return numeroOcorrencias > 0;
    }, [
        criterioParada,
        dataFinal,
        numeroOcorrencias,
    ]);

    const gerarSlots = () => {
        const erroRecorrencia = validarRecorrencia({
            criterioParada,
            dataInicial,
            dataFinal,
            intervaloSemanas,
        });
        if (erroRecorrencia) {
            onErro(erroRecorrencia.mensagem);
            return;
        }

        if (diasSelecionados.size === 0) {
            onErro('Selecione ao menos um dia da semana.');
            return;
        }

        const todosComHorario = Array.from(diasSelecionados).every(
            (dia) => !!horarioPorDia[dia],
        );
        if (!todosComHorario) {
            onErro('Defina um horário para cada dia selecionado.');
            return;
        }

        const novoResultado = expandirRecorrencia({
            dataInicial,
            diasSelecionados,
            horarioPorDia,
            criterioParada,
            dataFinal,
            numeroOcorrencias,
            intervaloSemanas,
        });
        if (novoResultado.slots.length === 0) {
            onErro('Nenhuma data foi gerada para os critérios informados.');
            setResultado(null);
            onGerar([]);
            return;
        }

        onErro(null);
        setResultado(novoResultado);
        onGerar(novoResultado.slots);
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Dias da semana
                </label>
                <div className="grid grid-cols-3 gap-2">
                    {DIAS_SEMANA.map((dia) => (
                        <button
                            key={dia.valor}
                            type="button"
                            onClick={() => toggleDia(dia.valor)}
                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                diasSelecionados.has(dia.valor)
                                    ? 'border-[var(--color-gold)] bg-[var(--color-gold)] text-black'
                                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
                            }`}
                        >
                            {dia.label}
                        </button>
                    ))}
                </div>
            </div>

            {diasSelecionados.size > 0 && (
                <div className="space-y-2">
                    <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                        Horário por dia
                    </label>
                    {Array.from(diasSelecionados)
                        .sort()
                        .map((dia) => (
                            <div
                                key={dia}
                                className="flex flex-col items-center gap-2"
                            >
                                <span className="text-xs text-[var(--color-text-secondary)]">
                                    {
                                        DIAS_SEMANA.find(
                                            (item) => item.valor === dia,
                                        )?.label
                                    }
                                </span>
                                <TimePicker
                                    value={horarioPorDia[dia] ?? ''}
                                    onChange={(value) =>
                                        setHorarioPorDia((current) => ({
                                            ...current,
                                            [dia]: value,
                                        }))
                                    }
                                />
                            </div>
                        ))}
                </div>
            )}

            <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Data inicial
                </label>
                <DateKeyPicker
                    value={dataInicial}
                    onChange={(value) => {
                        limparResultado();
                        setDataInicial(value);
                    }}
                />
            </div>

            <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Repetir
                </label>
                <select
                    className={fieldClassName}
                    value={repeticao}
                    onChange={(event) => {
                        const value = event.target.value as
                            | '1'
                            | '2'
                            | 'personalizado';
                        limparResultado();
                        setRepeticao(value);
                        if (value === 'personalizado') {
                            setIntervaloPersonalizado(3);
                        }
                    }}
                >
                    <option value="1">Semanalmente</option>
                    <option value="2">A cada 2 semanas</option>
                    <option value="personalizado">Personalizado</option>
                </select>
                {repeticao === 'personalizado' && (
                    <div className="mt-2">
                        <label className="mb-1 block text-sm text-[var(--color-text-secondary)]">
                            A cada X semanas
                        </label>
                        <input
                            type="number"
                            min={1}
                            max={52}
                            step={1}
                            className={fieldClassName}
                            value={intervaloPersonalizado}
                            onChange={(event) => {
                                limparResultado();
                                setIntervaloPersonalizado(
                                    Number(event.target.value),
                                );
                            }}
                        />
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                            As datas se repetem a cada X semanas.
                        </p>
                    </div>
                )}
            </div>

            <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Critério de parada
                </label>
                <div className="flex flex-col gap-3 text-sm text-[var(--color-text-secondary)]">
                    <Radio
                        checked={criterioParada === 'ocorrencias'}
                        onChange={() => {
                            limparResultado();
                            setCriterioParada('ocorrencias');
                        }}
                    >
                        Número de ocorrências
                    </Radio>
                    <Radio
                        checked={criterioParada === 'data'}
                        onChange={() => {
                            limparResultado();
                            setCriterioParada('data');
                        }}
                    >
                        Data final
                    </Radio>
                </div>

                {criterioParada === 'ocorrencias' ? (
                    <input
                        type="number"
                        min={1}
                        className={`${fieldClassName} mt-2`}
                        value={numeroOcorrencias}
                        onChange={(event) => {
                            limparResultado();
                            setNumeroOcorrencias(Number(event.target.value));
                        }}
                    />
                ) : (
                    <DateKeyPicker
                        value={dataFinal}
                        onChange={(value) => {
                            limparResultado();
                            setDataFinal(value);
                        }}
                    />
                )}
            </div>

            <button
                type="button"
                disabled={!podeGerar}
                onClick={gerarSlots}
                className="h-10 w-full rounded-[8px] bg-[var(--color-gold)] text-sm font-semibold text-black disabled:opacity-50"
            >
                Gerar datas
            </button>

            {resultado && resultado.slots.length > 0 && (
                <div className="space-y-2">
                    {resultado.truncadoPorLimite && (
                        <p className="text-sm text-[var(--color-gold)]">
                            {criterioParada === 'ocorrencias'
                                ? `Geradas ${resultado.slots.length} de ${resultado.solicitadas} datas (limite de 2 anos)`
                                : `Geradas até ${formatBrazilDateKey(resultado.slots[resultado.slots.length - 1].data)} (limite de 2 anos)`}
                        </p>
                    )}
                    <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--color-text-secondary)]">
                        {resultado.slots.map((slot) => (
                            <li key={`${slot.data}-${slot.horario}`}>
                                {formatBrazilDateKey(slot.data)} às{' '}
                                {slot.horario}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
