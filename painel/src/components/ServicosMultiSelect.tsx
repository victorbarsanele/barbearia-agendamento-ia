import type { Servico } from '../services/servicos.service';

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
                    <label
                        key={servico.id}
                        className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-primary)]"
                    >
                        <input
                            type="checkbox"
                            checked={marcado}
                            disabled={disabled}
                            onChange={() => onToggle(servico.id)}
                            className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-gold)]"
                        />
                        <span>
                            {servico.nome} ({servico.duracaoMinutos} min)
                        </span>
                    </label>
                );
            })}
        </div>
    );
}
