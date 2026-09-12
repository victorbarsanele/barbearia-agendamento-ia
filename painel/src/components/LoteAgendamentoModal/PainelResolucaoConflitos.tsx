import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { TimePicker } from '../TimePicker';
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
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p>Tudo certo! Todas as datas estão disponíveis.</p>
            </div>
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
                            <TimePicker
                                value={horariosAlternativos[chave] ?? ''}
                                compact
                                onChange={(value) =>
                                    setHorariosAlternativos((current) => ({
                                        ...current,
                                        [chave]: value,
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
