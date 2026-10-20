import { useEffect, useRef } from 'react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

type ButtonVariant = 'primary' | 'danger' | 'danger-soft' | 'ghost' | 'outline';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    descriptionItems?: string[];
    confirmText?: string;
    cancelText?: string;
    loadingText?: string;
    confirmVariant?: ButtonVariant;
    cancelVariant?: ButtonVariant;
    alertDialog?: boolean;
    restoreFocusId?: string;
    loading?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    descriptionItems,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    loadingText = 'Excluindo...',
    confirmVariant = 'danger',
    cancelVariant = 'danger',
    alertDialog = false,
    restoreFocusId,
    loading = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCancelRef = useRef(onCancel);
    const loadingRef = useRef(loading);

    useEffect(() => {
        onCancelRef.current = onCancel;
        loadingRef.current = loading;
    }, [loading, onCancel]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const previouslyFocused =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
        dialogRef.current
            ?.querySelector<HTMLButtonElement>('[data-dialog-cancel]')
            ?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !loadingRef.current) {
                event.preventDefault();
                onCancelRef.current();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (
                previouslyFocused?.isConnected &&
                previouslyFocused !== document.body
            ) {
                previouslyFocused.focus();
            } else if (restoreFocusId) {
                document.getElementById(restoreFocusId)?.focus();
            }
        };
    }, [open, restoreFocusId]);

    if (!open) {
        return null;
    }

    return (
        <div
            ref={dialogRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/80 p-4 backdrop-blur-[1px]"
            role={alertDialog ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
        >
            <Card className="w-full max-w-md p-5 shadow-xl">
                <h2
                    id="confirm-dialog-title"
                    className="text-lg font-semibold text-[var(--color-gold)]"
                    style={{ fontFamily: 'var(--font-title)' }}
                >
                    {title}
                </h2>
                <p
                    id="confirm-dialog-description"
                    className="mt-2 text-sm text-[var(--color-text-secondary)]"
                >
                    {description}
                </p>
                {descriptionItems && descriptionItems.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-primary)]">
                        {descriptionItems.map((item) => (
                            <li key={item}>{item}</li>
                        ))}
                    </ul>
                )}

                <div className="mt-5 flex justify-end gap-2">
                    <Button
                        type="button"
                        variant={cancelVariant}
                        data-dialog-cancel
                        onClick={onCancel}
                        disabled={loading}
                        className="px-3 text-sm"
                    >
                        {cancelText}
                    </Button>
                    <Button
                        type="button"
                        variant={confirmVariant}
                        onClick={onConfirm}
                        disabled={loading}
                        className="px-3 text-sm"
                    >
                        {loading ? loadingText : confirmText}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
