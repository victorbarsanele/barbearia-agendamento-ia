import { useState } from 'react';
import { CalendarGrid } from '../CalendarGrid';
import { TimePicker } from '../TimePicker';
import { formatBrazilDateKey } from '../../utils/dateTime';

interface SlotLote {
    data: string;
    horario: string;
}

interface CalendarioSelecaoMultiplaProps {
    slots: SlotLote[];
    onChange: (slots: SlotLote[]) => void;
}

export function CalendarioSelecaoMultipla({
    slots,
    onChange,
}: CalendarioSelecaoMultiplaProps) {
    const [horarioManual, setHorarioManual] = useState('10:00');

    const alternarData = (data: string) => {
        if (slots.some((slot) => slot.data === data)) {
            onChange(slots.filter((slot) => slot.data !== data));
            return;
        }

        onChange(
            [...slots, { data, horario: horarioManual }].sort((a, b) =>
                a.data === b.data
                    ? a.horario.localeCompare(b.horario)
                    : a.data.localeCompare(b.data),
            ),
        );
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col items-center">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">
                    SELECIONE UM HORÁRIO
                </p>
                <TimePicker value={horarioManual} onChange={setHorarioManual} />
            </div>

            <CalendarGrid
                valueKey={null}
                selectedKeys={slots.map((slot) => slot.data)}
                onChange={alternarData}
                labels={{ title: 'Selecione as datas' }}
            />

            {slots.length > 0 && (
                <ul className="space-y-1 text-xs text-[var(--color-text-secondary)]">
                    {slots.map((slot) => (
                        <li
                            key={`${slot.data}-${slot.horario}`}
                            className="flex items-center justify-between rounded-[6px] bg-[var(--color-surface)] px-2 py-1"
                        >
                            <span>
                                {formatBrazilDateKey(slot.data)} às{' '}
                                {slot.horario}
                            </span>
                            <button
                                type="button"
                                className="text-[var(--color-danger)]"
                                onClick={() =>
                                    onChange(
                                        slots.filter(
                                            (item) =>
                                                item.data !== slot.data ||
                                                item.horario !== slot.horario,
                                        ),
                                    )
                                }
                            >
                                Remover
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
