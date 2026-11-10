import type { Pacote } from '../services/pacotes.service.js';
import { formatarLinhaPrecoPacote } from '../utils/pacoteCatalogo.js';

interface SelecaoPacoteCatalogoProps {
    pacotes: Pacote[];
    value: string;
    onChange: (pacoteId: string) => void;
    disabled?: boolean;
}

export function SelecaoPacoteCatalogo({
    pacotes,
    value,
    onChange,
    disabled = false,
}: SelecaoPacoteCatalogoProps) {
    const pacoteSelecionado = pacotes.find((pacote) => pacote.id === value);

    return (
        <div className="space-y-2">
            <label
                htmlFor="pacote-catalogo-edicao"
                className="block text-sm font-medium text-[var(--color-text-secondary)]"
            >
                Pacote do catálogo (opcional)
            </label>
            <select
                id="pacote-catalogo-edicao"
                aria-label="Pacote do catálogo (opcional)"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-gold)] disabled:cursor-not-allowed disabled:opacity-60"
            >
                <option value="">Sem pacote</option>
                {pacotes.map((pacote) => (
                    <option key={pacote.id} value={pacote.id}>
                        {pacote.nome}
                    </option>
                ))}
            </select>
            {pacoteSelecionado && (
                <p className="text-sm font-semibold text-[var(--color-gold)]">
                    {formatarLinhaPrecoPacote(pacoteSelecionado.preco)}
                </p>
            )}
        </div>
    );
}
