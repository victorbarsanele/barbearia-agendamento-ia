import { describe, expect, it } from 'vitest';
import { resolverDatasCitadas } from './data-citada';

const configuracaoFuncionamento = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaAberturaMinutos: 540,
    horaFechamentoMinutos: 1200,
    almocoInicioMinutos: null,
    almocoFimMinutos: null,
    limiteExtensaoMinutos: null,
    ultimoInicioExtensaoMinutos: null,
}));

const hoje = '2026-11-20';

function resolver(texto: string, horizonteAte = '2026-12-10') {
    return resolverDatasCitadas(
        texto,
        hoje,
        horizonteAte,
        configuracaoFuncionamento,
    );
}

describe('resolverDatasCitadas', () => {
    it('resolve DD/MM sem ano para a única ocorrência no horizonte', () => {
        expect(resolver('30/11')).toEqual([
            {
                dataISO: '2026-11-30',
                dataFormatada: '30/11/2026',
                diaDaSemana: 'segunda-feira',
                diaDeFuncionamento: true,
            },
        ]);
    });

    it('identifica domingo fechado', () => {
        expect(resolver('29/11')).toMatchObject([
            {
                dataISO: '2026-11-29',
                dataFormatada: '29/11/2026',
                diaDaSemana: 'domingo',
                diaDeFuncionamento: false,
            },
        ]);
    });

    it('aceita data numérica com ano e mês por extenso', () => {
        expect(resolver('30/11/2026')[0]?.dataISO).toBe('2026-11-30');
        expect(resolver('dia 30 de novembro')[0]?.dataISO).toBe('2026-11-30');
    });

    it('resolve dia DD quando há uma única ocorrência', () => {
        expect(resolver('dia 30', '2026-11-30')[0]?.dataISO).toBe('2026-11-30');
    });

    it('não escolhe dia DD quando há ocorrências ambíguas', () => {
        expect(resolver('dia 30', '2027-01-05')).toEqual([]);
    });

    it('ignora datas fora do horizonte e datas inválidas', () => {
        expect(resolver('30/11', '2026-11-29')).toEqual([]);
        expect(resolver('31/02')).toEqual([]);
    });

    it('extrai data no meio de texto sem interpretar o horário', () => {
        expect(resolver('quero dia 30/11 às 15h')[0]?.dataISO).toBe(
            '2026-11-30',
        );
    });

    it('não gera dica quando a mensagem não contém data', () => {
        expect(resolver('Quero agendar um corte.')).toEqual([]);
    });
});
