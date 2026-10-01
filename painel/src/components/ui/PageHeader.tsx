import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';
import { IconButton } from './IconButton';

interface PageHeaderProps {
    title: string;
    variant?: 'list' | 'form';
    subtitle?: string;
    backTo?: string | (() => void);
    backStyle?: 'text' | 'icon';
    action?: ReactNode;
}

export function PageHeader({
    title,
    variant = 'form',
    subtitle,
    backTo,
    backStyle = 'text',
    action,
}: PageHeaderProps) {
    const navigate = useNavigate();

    const handleBack =
        typeof backTo === 'string' ? () => navigate(backTo) : backTo;

    const titleContent = (
        <>
            <h1
                className={
                    variant === 'list'
                        ? 'text-[34px] font-bold leading-none text-[var(--color-gold)] font-title'
                        : 'text-3xl font-bold text-[var(--color-gold)] font-title'
                }
            >
                {title}
            </h1>
            {subtitle && (
                <p
                    className={
                        variant === 'list'
                            ? 'mt-2 text-xs text-[var(--color-text-secondary)]'
                            : 'mt-1 text-sm text-[var(--color-text-secondary)]'
                    }
                >
                    {subtitle}
                </p>
            )}
        </>
    );

    return (
        <header
            className={
                variant === 'list'
                    ? 'mb-5 flex items-center justify-between gap-3'
                    : 'mb-6 flex items-center gap-3'
            }
        >
            {variant === 'form' &&
                backTo &&
                (backStyle === 'icon' ? (
                    <IconButton ariaLabel="Voltar" onClick={handleBack}>
                        <ArrowLeft className="h-4 w-4" />
                    </IconButton>
                ) : (
                    <Button variant="ghost" onClick={handleBack}>
                        Voltar
                    </Button>
                ))}
            {variant === 'form' ? (
                <div>{titleContent}</div>
            ) : (
                <div>{titleContent}</div>
            )}
            {variant === 'list' && action}
        </header>
    );
}
