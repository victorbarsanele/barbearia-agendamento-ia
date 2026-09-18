import { useState } from 'react';

interface TimeTextInputProps {
    value: number | null;
    onChange: (value: number) => void;
    className?: string;
}

function formatarHora(minutos: number | null): string {
    if (minutos === null || !Number.isFinite(minutos)) return '';

    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    return `${String(horas).padStart(2, '0')}:${String(minutosRestantes).padStart(2, '0')}`;
}

function formatarDigitacao(valor: string): string {
    const digitos = valor.replace(/\D/g, '').slice(0, 4);

    if (digitos.length <= 2) return digitos;
    return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

function normalizarHora(valor: string): string | null {
    const digitos = valor.replace(/\D/g, '').slice(0, 4);
    if (!digitos) return null;

    const horas = Math.min(Number(digitos.slice(0, 2).padStart(2, '0')), 23);
    const minutos = Math.min(Number(digitos.slice(2).padEnd(2, '0')), 59);

    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

export function TimeTextInput({
    value,
    onChange,
    className,
}: TimeTextInputProps) {
    const [texto, setTexto] = useState(() => formatarHora(value));

    const handleBlur = () => {
        const horaNormalizada = normalizarHora(texto);
        if (!horaNormalizada) {
            setTexto(formatarHora(value));
            return;
        }

        setTexto(horaNormalizada);
        const [horas, minutos] = horaNormalizada.split(':').map(Number);
        onChange(horas * 60 + minutos);
    };

    return (
        <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={texto}
            onChange={(event) =>
                setTexto(formatarDigitacao(event.target.value))
            }
            onBlur={handleBlur}
            className={className}
        />
    );
}
