type SkeletonCardProps = {
    count?: number;
    heightClassName?: string;
    className?: string;
    variant?:
        | 'default'
        | 'agendamento'
        | 'row'
        | 'pacote'
        | 'dia'
        | 'bloqueio'
        | 'cliente';
};

function SkeletonItem({
    heightClassName = 'h-4',
    className = '',
}: {
    heightClassName?: string;
    className?: string;
}) {
    return (
        <div
            className={`animate-pulse rounded-md bg-[color:rgba(255,255,255,0.06)] ${heightClassName} ${className}`.trim()}
        />
    );
}

export function SkeletonCard({
    count = 4,
    heightClassName = 'min-h-[132px]',
    className = '',
    variant = 'default',
}: SkeletonCardProps) {
    if (variant === 'agendamento') {
        return (
            <div className={`space-y-3 ${className}`.trim()}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5"
                    >
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <SkeletonItem heightClassName="h-6 w-3/5" />
                                    <SkeletonItem
                                        heightClassName="h-5 w-2/5"
                                        className="mt-0"
                                    />
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    <SkeletonItem heightClassName="h-9 w-9" />
                                    <SkeletonItem heightClassName="h-9 w-[88px]" />
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                                <div className="flex items-center gap-2">
                                    <SkeletonItem heightClassName="h-11 w-[72px]" />
                                    <SkeletonItem heightClassName="h-11 w-[92px]" />
                                </div>
                                <SkeletonItem heightClassName="h-6 w-16" className="shrink-0" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === 'row') {
        return (
            <div className={`space-y-3 ${className}`.trim()}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-2">
                                <SkeletonItem heightClassName="h-5 w-[55%]" />
                                <SkeletonItem heightClassName="h-4 w-[35%]" />
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                <SkeletonItem heightClassName="h-11 w-[72px]" />
                                <SkeletonItem heightClassName="h-11 w-11" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === 'pacote') {
        return (
            <div className={`space-y-3 ${className}`.trim()}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_14px_35px_rgba(0,0,0,0.16)] sm:p-5"
                    >
                        <div className="flex flex-col gap-3">
                            <div className="space-y-2">
                                <div className="space-y-2">
                                    <SkeletonItem heightClassName="h-6 w-3/5" />
                                    <SkeletonItem heightClassName="h-7 w-2/5" />
                                </div>
                                <SkeletonItem heightClassName="h-8 w-56" />
                                <div>
                                    <SkeletonItem heightClassName="h-5 w-32" />
                                    <div className="mt-2 flex gap-2">
                                        <SkeletonItem heightClassName="h-9 w-32" />
                                        <SkeletonItem heightClassName="h-9 w-24" />
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] pt-3">
                                <SkeletonItem heightClassName="h-11 w-[72px]" />
                                <SkeletonItem heightClassName="h-11 w-11" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === 'dia') {
        return (
            <div className={`space-y-3 ${className}`.trim()}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5"
                    >
                        <div>
                            <div className="mb-4 flex flex-col gap-2">
                                <SkeletonItem heightClassName="h-4 w-1/3" />
                                <SkeletonItem heightClassName="h-4 w-1/2" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <SkeletonItem heightClassName="mb-2 h-4 w-20" />
                                    <SkeletonItem heightClassName="h-11 w-full" />
                                </div>
                                <div>
                                    <SkeletonItem heightClassName="mb-2 h-4 w-20" />
                                    <SkeletonItem heightClassName="h-11 w-full" />
                                </div>
                            </div>

                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-inset)] p-3">
                                <SkeletonItem heightClassName="mb-1 h-4 w-32" />
                                <SkeletonItem heightClassName="mt-4 h-11 w-2/3" />
                                <div className="mt-3 grid grid-cols-2 gap-3">
                                    <div>
                                        <SkeletonItem heightClassName="mb-2 h-4 w-20" />
                                        <SkeletonItem heightClassName="h-11 w-full" />
                                    </div>
                                    <div>
                                        <SkeletonItem heightClassName="mb-2 h-4 w-20" />
                                        <SkeletonItem heightClassName="h-11 w-full" />
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-inset)] p-3">
                                <SkeletonItem heightClassName="mb-1 h-4 w-40" />
                                <SkeletonItem heightClassName="mt-4 h-11 w-3/4" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === 'bloqueio') {
        return (
            <div className={`space-y-3 ${className}`.trim()}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <SkeletonItem heightClassName="h-5 w-3/5" />
                                <SkeletonItem heightClassName="mt-1.5 h-6 w-20" />
                                <SkeletonItem heightClassName="mt-1.5 h-5 w-2/5" />
                            </div>

                            <SkeletonItem heightClassName="h-11 w-11 shrink-0" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (variant === 'cliente') {
        return (
            <div className={`space-y-3 ${className}`.trim()}>
                {Array.from({ length: count }, (_, index) => (
                    <div
                        key={index}
                        className="rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5"
                    >
                        <div className="flex flex-col gap-3">
                            <div>
                                <SkeletonItem heightClassName="h-6 w-1/2" />
                                <SkeletonItem heightClassName="h-5 w-1/3" />
                            </div>

                            <div className="grid w-full grid-cols-4 gap-1 sm:ml-auto sm:flex sm:w-auto">
                                {Array.from({ length: 4 }, (_, actionIndex) => (
                                    <SkeletonItem
                                        key={actionIndex}
                                        heightClassName="h-14 w-full sm:w-14"
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className={`space-y-3 ${className}`.trim()}>
            {Array.from({ length: count }, (_, index) => (
                <div
                    key={index}
                    className={`rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5 ${heightClassName}`.trim()}
                >
                    <div className="flex h-full flex-col gap-3">
                        <SkeletonItem heightClassName="h-5 w-3/5" />
                        <SkeletonItem heightClassName="h-4 w-2/5" />
                        <SkeletonItem heightClassName="h-4 w-4/5" />

                        <div className="mt-auto flex gap-2">
                            <SkeletonItem heightClassName="h-8 w-24" />
                            <SkeletonItem heightClassName="h-8 w-20" />
                            <SkeletonItem heightClassName="h-8 w-20" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
