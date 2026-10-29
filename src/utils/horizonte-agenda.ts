import { somarDiasAChaveData } from './dia-semana';

export const HORIZONTE_PADRAO_DIAS = 20;
export const HORIZONTE_MAX_DIAS = 180;

export interface ConfiguracaoHorizonteAgenda {
    horizonteDias: number | null;
    limiteAte: string | null;
}

export function calcularHorizonteAgenda(
    hojeChave: string,
    configuracao: ConfiguracaoHorizonteAgenda,
): string {
    const dias = configuracao.horizonteDias ?? HORIZONTE_PADRAO_DIAS;
    const fimJanela = somarDiasAChaveData(hojeChave, dias);
    const limiteAte = configuracao.limiteAte;

    if (limiteAte !== null && limiteAte >= hojeChave) {
        return limiteAte < fimJanela ? limiteAte : fimJanela;
    }

    return fimJanela;
}

export function calcularDiasNoCalendario(
    hojeChave: string,
    horizonteAte: string,
): number {
    let diasAteHorizonte = 0;
    let data = hojeChave;

    while (data < horizonteAte) {
        data = somarDiasAChaveData(data, 1);
        diasAteHorizonte += 1;
    }

    return diasAteHorizonte + 1;
}
