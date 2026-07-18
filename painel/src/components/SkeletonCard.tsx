type SkeletonCardProps = {
    count?: number;
    heightClassName?: string;
    className?: string;
    variant?: 'default' | 'agendamento';
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
                        className={`rounded-[12px] border border-[var(--color-border)] bg-[color:rgba(255,255,255,0.03)] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:p-5 ${heightClassName}`.trim()}
                    >
                        <div className="flex h-full flex-col gap-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1 space-y-3">
                                    <SkeletonItem heightClassName="h-10 w-24" />
                                    <SkeletonItem heightClassName="h-5 w-3/4" />
                                    <SkeletonItem heightClassName="h-4 w-1/2" />
                                </div>

                                <SkeletonItem heightClassName="h-7 w-20 rounded-full" />
                            </div>

                            <div className="mt-auto flex gap-2 border-t border-[var(--color-border)] pt-3">
                                <SkeletonItem heightClassName="h-9 flex-1" />
                                <SkeletonItem heightClassName="h-9 flex-1" />
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
