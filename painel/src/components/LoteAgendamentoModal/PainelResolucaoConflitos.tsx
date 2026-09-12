import { useState } from 'react';
import { formatBrazilDateKey } from '../../utils/dateTime';

interface SlotLote {
    data: string;
    horario: string;
}

interface ConflitoSlot extends SlotLote {
    motivo: string;
}

interface PainelResolucaoConflitosProps {
    conflitos: ConflitoSlot[];
    verificando: string | null;
    onRemoverSlot: (slot: SlotLote) => void;
    onEscolherNovoHorario: (
        slotAntigo: SlotLote,
        novoHorario: string,
    ) => Promise<void>;
}

export function PainelResolucaoConflitos({
    conflitos,
    verificando,
    onRemoverSlot,
    onEscolherNovoHorario,
}: PainelResolucaoConflitosProps) {
    const [horariosAlternativos, setHorariosAlternativos] = useState<
        Record<string, string>
    >({});

    if (conflitos.length === 0) {
        return (
            <p className="text-sm text-[var(--color-text-secondary)]">
                Nenhum conflito encontrado nos horários selecionados.
            </p>
        );
    }

    return (
        <ul className="space-y-2">
            {conflitos.map((conflito) => {
                const chave = `${conflito.data}-${conflito.horario}`;
                return (
                    <li
                        key={chave}
                        className="space-y-2 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-surface)] p-3"
                    >
                        <div>
                            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                {formatBrazilDateKey(conflito.data)} às{' '}
                                {conflito.horario}
                            </p>
                            <p className="text-xs text-[var(--color-danger)]">
                                {conflito.motivo}
                            </p>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="time"
                                className="h-9 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-2 text-xs text-[var(--color-text-primary)]"
                                value={horariosAlternativos[chave] ?? ''}
                                onChange={(event) =>
                                    setHorariosAlternativos((current) => ({
                                        ...current,
                                        [chave]: event.target.value,
                                    }))
                                }
                            />
                            <button
                                type="button"
                                disabled={
                                    !horariosAlternativos[chave] ||
                                    verificando === chave
                                }
                                onClick={() =>
                                    void onEscolherNovoHorario(
                                        {
                                            data: conflito.data,
                                            horario: conflito.horario,
                                        },
                                        horariosAlternativos[chave],
                                    )
                                }
                                className="rounded-[6px] border border-[var(--color-gold)]/40 px-2 py-1 text-xs font-semibold text-[var(--color-gold)] disabled:opacity-50"
                            >
                                {verificando === chave
                                    ? 'Verificando...'
                                    : 'Escolher outro horário'}
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    onRemoverSlot({
                                        data: conflito.data,
                                        horario: conflito.horario,
                                    })
                                }
                                className="rounded-[6px] border border-[var(--color-danger)]/40 px-2 py-1 text-xs font-semibold text-[var(--color-danger)]"
                            >
                                Remover esta data
                            </button>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
