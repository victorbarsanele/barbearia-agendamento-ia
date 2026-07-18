import { Button } from './ui/Button';
import { Card } from './ui/Card';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!open) {
        return null;
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 p-4 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <Card className="w-full max-w-md p-5 shadow-xl">
                <h2
                    className="text-lg font-semibold text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    {title}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                    {description}
                </p>

                <div className="mt-5 flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="danger"
                        onClick={onCancel}
                        disabled={loading}
                        className="min-h-9 px-3 text-sm"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        type="button"
                        variant="danger"
                        onClick={onConfirm}
                        disabled={loading}
                        className="min-h-9 px-3 text-sm"
                    >
                        {loading ? 'Excluindo...' : confirmText}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
