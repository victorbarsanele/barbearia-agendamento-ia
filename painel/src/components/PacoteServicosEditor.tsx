import { Plus, Trash2 } from 'lucide-react';
import type { Servico } from '../services/servicos.service';
import { Button } from './ui/Button';

export interface PacoteServicoFormRow {
    servicoId: string;
    quantidade: string;
}

interface PacoteServicosEditorProps {
    servicos: Servico[];
    linhas: PacoteServicoFormRow[];
    onChange: (linhas: PacoteServicoFormRow[]) => void;
    disabled?: boolean;
}

const fieldClassName =
    'h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-gold)]';

export function PacoteServicosEditor({
    servicos,
    linhas,
    onChange,
    disabled = false,
}: PacoteServicosEditorProps) {
    const adicionarLinha = () => {
        onChange([...linhas, { servicoId: '', quantidade: '' }]);
    };

    const removerLinha = (index: number) => {
        onChange(linhas.filter((_, linhaIndex) => linhaIndex !== index));
    };

    const atualizarLinha = (
        index: number,
        changes: Partial<PacoteServicoFormRow>,
    ) => {
        onChange(
            linhas.map((linha, linhaIndex) =>
                linhaIndex === index ? { ...linha, ...changes } : linha,
            ),
        );
    };

    return (
        <div className="space-y-3">
            {linhas.map((linha, index) => {
                const outrosSelecionados = new Set(
                    linhas
                        .filter((_, linhaIndex) => linhaIndex !== index)
                        .map((item) => item.servicoId)
                        .filter(Boolean),
                );

                return (
                    <div
                        key={`${index}-${linha.servicoId}`}
                        className="grid grid-cols-[minmax(0,1fr)_104px_auto] items-end gap-2"
                    >
                        <label className="min-w-0 text-xs text-[var(--color-text-secondary)]">
                            Serviço
                            <select
                                value={linha.servicoId}
                                onChange={(event) =>
                                    atualizarLinha(index, {
                                        servicoId: event.target.value,
                                    })
                                }
                                disabled={disabled}
                                className={fieldClassName}
                            >
                                <option value="">Selecione</option>
                                {servicos.map((servico) => (
                                    <option
                                        key={servico.id}
                                        value={servico.id}
                                        disabled={
                                            outrosSelecionados.has(servico.id)
                                        }
                                    >
                                        {servico.nome}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="text-xs text-[var(--color-text-secondary)]">
                            Quantidade
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={linha.quantidade}
                                onChange={(event) =>
                                    atualizarLinha(index, {
                                        quantidade: event.target.value,
                                    })
                                }
                                disabled={disabled}
                                placeholder="Ex: 4"
                                className={fieldClassName}
                            />
                        </label>

                        <Button
                            type="button"
                            variant="ghost"
                            aria-label="Remover serviço"
                            title="Remover serviço"
                            onClick={() => removerLinha(index)}
                            disabled={disabled}
                            className="min-h-11 w-11 px-0"
                        >
                            <Trash2 size={16} aria-hidden="true" />
                        </Button>
                    </div>
                );
            })}

            <Button
                type="button"
                variant="ghost"
                onClick={adicionarLinha}
                disabled={disabled || linhas.length >= servicos.length}
                className="min-h-10 px-3 text-xs"
            >
                <Plus size={16} aria-hidden="true" />
                Adicionar serviço
            </Button>
        </div>
    );
}