import { fromZonedTime } from 'date-fns-tz';
import { AppError } from '../lib/app-error';
import { TIME_ZONE } from '../services/horario-funcionamento';

export interface IntervaloRelatorio {
    inicio: Date;
    fimExclusivo: Date;
}

interface DataLocalValidada {
    dataUtc: Date;
    chave: string;
}

function validarDataLocal(
    chave: string,
    campo: 'de' | 'ate',
): DataLocalValidada {
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(chave);
    if (!partes) {
        throw new AppError(
            `Parâmetro "${campo}" deve estar no formato YYYY-MM-DD.`,
            400,
        );
    }

    const ano = Number(partes[1]);
    const mes = Number(partes[2]);
    const dia = Number(partes[3]);
    const dataUtc = new Date(0);
    dataUtc.setUTCHours(0, 0, 0, 0);
    dataUtc.setUTCFullYear(ano, mes - 1, dia);

    if (
        dataUtc.getUTCFullYear() !== ano ||
        dataUtc.getUTCMonth() !== mes - 1 ||
        dataUtc.getUTCDate() !== dia
    ) {
        throw new AppError(
            `Parâmetro "${campo}" deve ser uma data válida.`,
            400,
        );
    }

    return { dataUtc, chave };
}

function formatarDataUtc(data: Date): string {
    return [
        String(data.getUTCFullYear()).padStart(4, '0'),
        String(data.getUTCMonth() + 1).padStart(2, '0'),
        String(data.getUTCDate()).padStart(2, '0'),
    ].join('-');
}

export function calcularIntervaloRelatorio(
    de: string,
    ate: string,
): IntervaloRelatorio {
    const inicioLocal = validarDataLocal(de, 'de');
    const fimLocal = validarDataLocal(ate, 'ate');

    if (de > ate) {
        throw new AppError(
            'Parâmetro "de" não pode ser posterior a "ate".',
            400,
        );
    }

    const quantidadeDias =
        (fimLocal.dataUtc.getTime() - inicioLocal.dataUtc.getTime()) /
            86_400_000 +
        1;
    if (quantidadeDias > 366) {
        throw new AppError('Intervalo não pode exceder 366 dias.', 400);
    }

    const diaSeguinte = new Date(fimLocal.dataUtc);
    diaSeguinte.setUTCDate(diaSeguinte.getUTCDate() + 1);
    const chaveFimExclusivo = formatarDataUtc(diaSeguinte);
    if (chaveFimExclusivo.length !== 10) {
        throw new AppError(
            'Parâmetro "ate" não permite calcular dia seguinte.',
            400,
        );
    }

    return {
        inicio: fromZonedTime(`${inicioLocal.chave}T00:00:00`, TIME_ZONE),
        fimExclusivo: fromZonedTime(`${chaveFimExclusivo}T00:00:00`, TIME_ZONE),
    };
}
