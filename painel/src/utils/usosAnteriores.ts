export function validarUsosAnteriores(
    valor: string | number,
    quantidadeTotal: number,
): string | null {
    if (typeof valor === 'string' && valor.trim() === '') {
        return null;
    }

    const numero = typeof valor === 'number' ? valor : Number(valor);

    if (!Number.isInteger(numero)) {
        return 'Informe um número inteiro.';
    }

    if (numero < 0) {
        return 'Usos anteriores não podem ser negativos.';
    }

    if (numero >= quantidadeTotal) {
        return 'Usos anteriores devem ser menores que a quantidade total.';
    }

    return null;
}

export function montarPayloadUsosAnteriores(
    linhas: { servicoId: string; valor: string }[],
): { servicoId: string; usosAnteriores: number }[] {
    return linhas
        .map((linha) => ({
            servicoId: linha.servicoId,
            usosAnteriores: Number(linha.valor || 0),
        }))
        .filter((linha) => linha.usosAnteriores > 0);
}

export function rotuloPrimeiroNumero(
    usosAnteriores: number,
    quantidadeTotal: number,
): string {
    return `O primeiro agendamento será ${usosAnteriores + 1} de ${quantidadeTotal}`;
}
