export const HORAS_TIME_PICKER = Array.from({ length: 17 }, (_, index) =>
    String(index + 6).padStart(2, '0'),
);
export const MINUTOS_TIME_PICKER = ['00', '15', '30', '45'];

interface ScrollGeometry {
    columnTop: number;
    columnScrollTop: number;
    columnClientHeight: number;
    columnScrollHeight: number;
    itemTop: number;
    itemHeight: number;
}

export function calcularScrollTopCentralizado({
    columnTop,
    columnScrollTop,
    columnClientHeight,
    columnScrollHeight,
    itemTop,
    itemHeight,
}: ScrollGeometry): number {
    const target =
        itemTop -
        columnTop +
        columnScrollTop -
        (columnClientHeight / 2 - itemHeight / 2);
    const maxScrollTop = Math.max(0, columnScrollHeight - columnClientHeight);

    return Math.min(Math.max(target, 0), maxScrollTop);
}

export function horarioRepresentavelNoSeletor(
    hora: string,
    minuto: string,
): boolean {
    return (
        HORAS_TIME_PICKER.includes(hora) && MINUTOS_TIME_PICKER.includes(minuto)
    );
}
