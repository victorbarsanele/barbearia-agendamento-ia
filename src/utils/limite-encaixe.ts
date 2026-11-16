export interface IntervaloAgendamento {
    inicio: Date;
    fim: Date;
}

export function maximoSimultaneoNoIntervalo(
    inicio: Date,
    fim: Date,
    intervalos: IntervaloAgendamento[],
): number {
    const inicioMs = inicio.getTime();
    const fimMs = fim.getTime();
    if (fimMs <= inicioMs) return 0;

    const eventos: { instante: number; delta: -1 | 1 }[] = [];
    for (const intervalo of intervalos) {
        const inicioIntervalo = Math.max(inicioMs, intervalo.inicio.getTime());
        const fimIntervalo = Math.min(fimMs, intervalo.fim.getTime());
        if (inicioIntervalo >= fimIntervalo) continue;

        eventos.push(
            { instante: inicioIntervalo, delta: 1 },
            { instante: fimIntervalo, delta: -1 },
        );
    }

    eventos.sort((a, b) => a.instante - b.instante || a.delta - b.delta);

    let simultaneos = 0;
    let maximo = 0;
    for (const evento of eventos) {
        simultaneos += evento.delta;
        maximo = Math.max(maximo, simultaneos);
    }
    return maximo;
}
