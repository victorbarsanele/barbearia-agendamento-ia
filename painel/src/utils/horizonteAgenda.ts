const HORIZONTE_PADRAO_DIAS = 20;
const HORIZONTE_MAX_DIAS = 180;

export interface HorizontePreview {
    fim: string;
    tetoAtivo: boolean;
    tetoRestringe: boolean;
}

function diasNoMes(ano: number, mes: number): number {
    if (mes === 2) {
        const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
        return bissexto ? 29 : 28;
    }

    return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function chaveDataValida(chave: string): boolean {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chave);
    if (!partes) return false;

    const ano = Number(partes[1]);
    const mes = Number(partes[2]);
    const dia = Number(partes[3]);

    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes);
}

function somarDiasAChave(chave: string, dias: number): string {
    const [anoInicial, mesInicial, diaInicial] = chave.split('-').map(Number);
    let ano = anoInicial;
    let mes = mesInicial;
    let dia = diaInicial + dias;

    while (dia > diasNoMes(ano, mes)) {
        dia -= diasNoMes(ano, mes);
        mes += 1;
        if (mes > 12) {
            mes = 1;
            ano += 1;
        }
    }

    return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export function calcularHorizontePreview(
    hojeChave: string,
    horizonteDias: number | null,
    limiteAte: string | null,
): HorizontePreview {
    const fimJanela = somarDiasAChave(
        hojeChave,
        horizonteDias ?? HORIZONTE_PADRAO_DIAS,
    );
    const tetoAtivo = limiteAte !== null && limiteAte >= hojeChave;
    const tetoRestringe = tetoAtivo && limiteAte < fimJanela;

    return {
        fim: tetoRestringe ? limiteAte : fimJanela,
        tetoAtivo,
        tetoRestringe,
    };
}

export function validarHorizonteDias(valor: string): string | null {
    if (valor === '') return null;
    if (!/^\d+$/.test(valor)) {
        return 'Informe um número inteiro de dias.';
    }

    const dias = Number(valor);
    if (dias < 1 || dias > HORIZONTE_MAX_DIAS) {
        return 'A janela deve ter entre 1 e 180 dias.';
    }

    return null;
}

export function validarLimiteAte(
    limiteAte: string,
    hojeChave: string,
): string | null {
    if (limiteAte === '') return null;
    if (!chaveDataValida(limiteAte)) {
        return 'Informe uma data válida.';
    }
    if (limiteAte < hojeChave) {
        return 'O teto não pode ser anterior a hoje.';
    }
    if (limiteAte > somarDiasAChave(hojeChave, HORIZONTE_MAX_DIAS)) {
        return 'O teto não pode ultrapassar 180 dias à frente.';
    }

    return null;
}
