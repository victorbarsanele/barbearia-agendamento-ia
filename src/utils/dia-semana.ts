export const DIAS_SEMANA = [
    'domingo',
    'segunda',
    'terca',
    'quarta',
    'quinta',
    'sexta',
    'sabado',
] as const;

export type DiaDaSemana = (typeof DIAS_SEMANA)[number];

const NOMES_DIAS_SEMANA: Record<DiaDaSemana, string> = {
    domingo: 'domingo',
    segunda: 'segunda-feira',
    terca: 'terça-feira',
    quarta: 'quarta-feira',
    quinta: 'quinta-feira',
    sexta: 'sexta-feira',
    sabado: 'sábado',
};

const TIME_ZONE = 'America/Sao_Paulo';

function chaveDataEmBrasilia(instante: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(instante);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
        throw new RangeError('Não foi possível obter data em Brasília.');
    }

    return `${year}-${month}-${day}`;
}

function validarChaveData(chave: string): [number, number, number] {
    const match = chave.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        throw new RangeError('Data deve estar no formato AAAA-MM-DD.');
    }
    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const check = new Date(Date.UTC(year, month - 1, day));

    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        throw new RangeError('Data inválida.');
    }

    return [year, month, day];
}

function diaPelaChave(chave: string): DiaDaSemana {
    const [year, month, day] = validarChaveData(chave);
    return DIAS_SEMANA[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function nomeDiaDaSemana(dia: DiaDaSemana): string {
    return NOMES_DIAS_SEMANA[dia];
}

export function diaDaSemanaEmBrasilia(instanteOuChave: Date | string): DiaDaSemana {
    if (instanteOuChave instanceof Date) {
        if (Number.isNaN(instanteOuChave.getTime())) {
            throw new RangeError('Instante inválido.');
        }
        return diaPelaChave(chaveDataEmBrasilia(instanteOuChave));
    }
    return diaPelaChave(instanteOuChave);
}

export function somarDiasAChaveData(chave: string, dias: number): string {
    const [year, month, day] = validarChaveData(chave);
    const date = new Date(Date.UTC(year, month - 1, day + dias));
    return [
        String(date.getUTCFullYear()).padStart(4, '0'),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

export function dataMaisProximaComDiaDaSemana(
    chaveData: string,
    dia: DiaDaSemana,
): string {
    validarChaveData(chaveData);
    for (let distancia = -3; distancia <= 3; distancia += 1) {
        const candidata = somarDiasAChaveData(chaveData, distancia);
        if (diaPelaChave(candidata) === dia) {
            return candidata;
        }
    }
    throw new RangeError('Não foi possível resolver dia da semana.');
}
