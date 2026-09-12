import type { Servico } from '../services/servicos.service';
import { Checkbox } from './ui/Checkbox';

interface ServicosMultiSelectProps {
    servicos: Servico[];
    selecionados: string[];
    onToggle: (servicoId: string) => void;
    disabled?: boolean;
}

export function ServicosMultiSelect({
    servicos,
    selecionados,
    onToggle,
    disabled = false,
}: ServicosMultiSelectProps) {
    if (servicos.length === 0) {
        return (
            <p className="text-sm text-[var(--color-text-secondary)]">
                Nenhum serviço cadastrado.
            </p>
        );
    }

    return (
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            {servicos.map((servico) => {
                const marcado = selecionados.includes(servico.id);

                return (
                    <Checkbox
                        key={servico.id}
                        checked={marcado}
                        disabled={disabled}
                        onChange={() => onToggle(servico.id)}
                        className="text-[var(--color-text-primary)]"
                    >
                        {servico.nome} ({servico.duracaoMinutos} min)
                    </Checkbox>
                );
            })}
        </div>
    );
}
