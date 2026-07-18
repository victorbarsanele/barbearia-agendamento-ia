export const HORAS_NOVO_AGENDAMENTO = Array.from({ length: 17 }, (_, index) =>
    String(index + 6).padStart(2, '0'),
);

export const MINUTOS_NOVO_AGENDAMENTO = ['00', '15', '30', '45'];

export function normalizarHorarioSelecionado(
    horaSelecionada: string,
    minutoSelecionado: string,
): { hora: string; minuto: string } {
    if (horaSelecionada && minutoSelecionado === '60') {
        const proximaHora = Number(horaSelecionada) + 1;

        return {
            hora: String(proximaHora).padStart(2, '0'),
            minuto: '00',
        };
    }

    return {
        hora: horaSelecionada,
        minuto: minutoSelecionado,
    };
}
