import { Button } from '../ui/Button';
import { formatBrazilDateKey } from '../../utils/dateTime';

interface SlotLote {
    data: string;
    horario: string;
}

interface ResumoConfirmacaoLoteProps {
    clienteNome: string;
    servicoNome: string;
    slots: SlotLote[];
    pacoteClienteId?: string;
    enviando: boolean;
    erro: string | null;
    onConfirmar: () => void;
    onVoltar: () => void;
}

export function ResumoConfirmacaoLote({
    clienteNome,
    servicoNome,
    slots,
    pacoteClienteId,
    enviando,
    erro,
    onConfirmar,
    onVoltar,
}: ResumoConfirmacaoLoteProps) {
    return (
        <div className="space-y-4">
            <div className="space-y-1 text-sm text-[var(--color-text-primary)]">
                <p>
                    Cliente:{' '}
                    <span className="font-semibold">{clienteNome}</span>
                </p>
                <p>
                    Serviço:{' '}
                    <span className="font-semibold">{servicoNome}</span>
                </p>
                {pacoteClienteId && (
                    <p className="text-[var(--color-text-secondary)]">
                        Vinculado ao pacote ativo do cliente.
                    </p>
                )}
                <p>
                    Total de agendamentos:{' '}
                    <span className="font-semibold">{slots.length}</span>
                </p>
            </div>

            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-[var(--color-text-secondary)]">
                {slots.map((slot) => (
                    <li key={`${slot.data}-${slot.horario}`}>
                        {formatBrazilDateKey(slot.data)} às {slot.horario}
                    </li>
                ))}
            </ul>

            {erro && (
                <p className="text-sm text-[var(--color-danger)]">{erro}</p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                    disabled={enviando || slots.length === 0}
                    onClick={onConfirmar}
                    className="min-h-11 flex-1"
                >
                    {enviando ? 'Confirmando...' : 'Confirmar'}
                </Button>
                <Button
                    variant="ghost"
                    disabled={enviando}
                    onClick={onVoltar}
                    className="min-h-11 flex-1"
                >
                    Voltar
                </Button>
            </div>
        </div>
    );
}
