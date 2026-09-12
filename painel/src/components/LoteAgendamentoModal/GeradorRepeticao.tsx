import { useMemo, useState } from 'react';
import { DateKeyPicker } from '../DateKeyPicker';
import { TimePicker } from '../TimePicker';
import { Radio } from '../ui/Radio';

interface SlotLote {
    data: string;
    horario: string;
}

interface GeradorRepeticaoProps {
    onGerar: (slots: SlotLote[]) => void;
}

const DIAS_SEMANA = [
    { valor: 1, label: 'Seg' },
    { valor: 2, label: 'Ter' },
    { valor: 3, label: 'Qua' },
    { valor: 4, label: 'Qui' },
    { valor: 5, label: 'Sex' },
    { valor: 6, label: 'Sáb' },
];

const MAX_DIAS_VARREDURA = 365;

const fieldClassName =
    'h-10 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)]';

function getHojeEmBrasiliaParaInput(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
    }).format(new Date());
    return parts;
}

function proximaData(dataKey: string, dias: number): string {
    const [year, month, day] = dataKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + dias));
    return date.toISOString().slice(0, 10);
}

function diaDaSemana(dataKey: string): number {
    const [year, month, day] = dataKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function GeradorRepeticao({ onGerar }: GeradorRepeticaoProps) {
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

    const toggleDia = (dia: number) => {
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
        if (diasSelecionados.size === 0) {
            return false;
        }

        const todosComHorario = Array.from(diasSelecionados).every(
            (dia) => !!horarioPorDia[dia],
        );
        if (!todosComHorario) {
            return false;
        }

        if (criterioParada === 'data') {
            return !!dataFinal;
        }

        return numeroOcorrencias > 0;
    }, [
        diasSelecionados,
        horarioPorDia,
        criterioParada,
        dataFinal,
        numeroOcorrencias,
    ]);

    const gerarSlots = () => {
        const slots: SlotLote[] = [];
        let dataAtual = dataInicial;

        for (let i = 0; i < MAX_DIAS_VARREDURA; i += 1) {
            const dia = diaDaSemana(dataAtual);

            if (diasSelecionados.has(dia) && horarioPorDia[dia]) {
                slots.push({ data: dataAtual, horario: horarioPorDia[dia] });

                if (
                    criterioParada === 'ocorrencias' &&
                    slots.length >= numeroOcorrencias
                ) {
                    break;
                }
            }

            dataAtual = proximaData(dataAtual, 1);

            if (criterioParada === 'data' && dataAtual > dataFinal) {
                break;
            }
        }

        onGerar(slots);
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
                <DateKeyPicker value={dataInicial} onChange={setDataInicial} />
            </div>

            <div>
                <label className="mb-1 block text-sm font-semibold text-[var(--color-text-primary)]">
                    Critério de parada
                </label>
                <div className="flex flex-col gap-3 text-sm text-[var(--color-text-secondary)]">
                    <Radio
                        checked={criterioParada === 'ocorrencias'}
                        onChange={() => setCriterioParada('ocorrencias')}
                    >
                        Número de ocorrências
                    </Radio>
                    <Radio
                        checked={criterioParada === 'data'}
                        onChange={() => setCriterioParada('data')}
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
                        onChange={(event) =>
                            setNumeroOcorrencias(Number(event.target.value))
                        }
                    />
                ) : (
                    <DateKeyPicker value={dataFinal} onChange={setDataFinal} />
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
        </div>
    );
}
