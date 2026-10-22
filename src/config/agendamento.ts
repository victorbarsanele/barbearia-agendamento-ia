export interface AgendamentoConfig {
    minAntecedenciaMinutos: number;
    ofertaFolgaMinutos: number;
}

function lerInteiroConfigurado(
    nome: string,
    padrao: number,
    minimo: number,
    maximo: number,
): number {
    const valorRecebido = process.env[nome];
    if (valorRecebido === undefined) {
        return padrao;
    }

    const valorNormalizado = valorRecebido.trim();
    const valor = Number(valorNormalizado);
    if (
        !/^-?\d+$/.test(valorNormalizado) ||
        !Number.isInteger(valor) ||
        valor < minimo ||
        valor > maximo
    ) {
        throw new Error(
            `${nome} inválida: valor recebido "${valorRecebido}". Informe um inteiro entre ${minimo} e ${maximo}.`,
        );
    }

    return valor;
}

export function getAgendamentoConfig(): AgendamentoConfig {
    return {
        minAntecedenciaMinutos: lerInteiroConfigurado(
            'MIN_ANTECEDENCIA_MINUTOS',
            60,
            0,
            1440,
        ),
        ofertaFolgaMinutos: lerInteiroConfigurado(
            'OFERTA_FOLGA_MINUTOS',
            0,
            0,
            120,
        ),
    };
}

export function validarAgendamentoConfig(): void {
    getAgendamentoConfig();
}
