export interface AgendamentoConfig {
    minAntecedenciaMinutos: number;
    ofertaFolgaMinutos: number;
    confirmacaoToleranciaMinutos: number;
    avisoCurtoPrazoMinutos: number;
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
        confirmacaoToleranciaMinutos: lerInteiroConfigurado(
            'CONFIRMACAO_TOLERANCIA_MINUTOS',
            0,
            0,
            60,
        ),
        avisoCurtoPrazoMinutos: lerInteiroConfigurado(
            'AVISO_CURTO_PRAZO_MINUTOS',
            60,
            0,
            1440,
        ),
    };
}

export function getConfirmacaoAgendamentoConfig(): Pick<
    AgendamentoConfig,
    | 'minAntecedenciaMinutos'
    | 'ofertaFolgaMinutos'
    | 'confirmacaoToleranciaMinutos'
> {
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
        confirmacaoToleranciaMinutos: lerInteiroConfigurado(
            'CONFIRMACAO_TOLERANCIA_MINUTOS',
            0,
            0,
            60,
        ),
    };
}

export function validarAgendamentoConfig(): void {
    getAgendamentoConfig();
}
