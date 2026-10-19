import { normalizarSemAcentos } from './nome-cliente';

export interface IdentidadeBarbeiro {
    nome: string;
    nomesAceitos: string[];
}

export function carregarIdentidadeBarbeiro(
    env: Record<string, string | undefined> = process.env,
): IdentidadeBarbeiro | null {
    const nome = env.BARBER_NAME?.trim().replace(/\s+/gu, ' ');
    if (!nome) {
        return null;
    }

    const candidatos = [
        nome,
        nome.split(' ')[0],
        ...(env.BARBER_ALIASES ?? '').split(','),
    ];
    const chavesCandidatos = new Set<string>();
    const chavesSaida = new Set<string>();
    const nomesAceitos: string[] = [];

    for (const candidato of candidatos) {
        const valor = candidato.trim().replace(/\s+/gu, ' ');
        if (!valor) {
            continue;
        }

        const chave = normalizarSemAcentos(valor).toLocaleLowerCase('pt-BR');
        if (chavesCandidatos.has(chave)) {
            continue;
        }
        chavesCandidatos.add(chave);

        const semAcentos = normalizarSemAcentos(valor);
        for (const forma of [valor, semAcentos]) {
            const chaveForma = forma.toLocaleLowerCase('pt-BR');
            if (!chavesSaida.has(chaveForma)) {
                chavesSaida.add(chaveForma);
                nomesAceitos.push(forma);
            }
        }
    }

    return { nome, nomesAceitos };
}
