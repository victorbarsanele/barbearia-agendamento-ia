import { expect, test } from '@playwright/test';
import {
    calcularPeriodoAtalho,
    formatarDataRelatorio,
    formatarValorEstimado,
    montarCsvAtendimentos,
    validarIntervaloRelatorio,
} from '../src/utils/relatorios.js';

test.describe('helpers de relatórios', () => {
    test('formata data ISO sem alterar entrada inválida', () => {
        expect(formatarDataRelatorio('2026-07-31')).toBe('31/07/2026');
        expect(formatarDataRelatorio('2026-01-01')).toBe('01/01/2026');
        expect(formatarDataRelatorio('2026-12-31')).toBe('31/12/2026');
        expect(formatarDataRelatorio('2026-02-30')).toBe('2026-02-30');
        expect(formatarDataRelatorio('data desconhecida')).toBe(
            'data desconhecida',
        );
    });

    test('calcula mês atual usando dia local de São Paulo, não dia UTC', () => {
        expect(
            calcularPeriodoAtalho(
                'este-mes',
                new Date('2026-03-01T02:00:00.000Z'),
            ),
        ).toEqual({ de: '2026-02-01', ate: '2026-02-28' });
    });

    test('calcula mês anterior na virada do ano', () => {
        expect(calcularPeriodoAtalho('mes-passado', '2026-01-10')).toEqual({
            de: '2025-12-01',
            ate: '2025-12-31',
        });
    });

    test('respeita fevereiro bissexto e últimos 30 dias', () => {
        expect(calcularPeriodoAtalho('mes-passado', '2024-03-15')).toEqual({
            de: '2024-02-01',
            ate: '2024-02-29',
        });
        expect(
            calcularPeriodoAtalho(
                'ultimos-30-dias',
                new Date('2026-03-01T02:00:00.000Z'),
            ),
        ).toEqual({ de: '2026-01-30', ate: '2026-02-28' });
    });

    test('valida intervalo vazio, inválido, invertido e máximo', () => {
        expect(validarIntervaloRelatorio('', '2026-02-01')).toContain(
            'Informe',
        );
        expect(validarIntervaloRelatorio('2026-02-31', '2026-03-01')).toContain(
            'válidas',
        );
        expect(validarIntervaloRelatorio('2026-03-02', '2026-03-01')).toContain(
            'anterior',
        );
        expect(validarIntervaloRelatorio('2025-01-01', '2026-01-01')).toBe(
            null,
        );
        expect(validarIntervaloRelatorio('2025-01-01', '2026-01-02')).toContain(
            '366 dias',
        );
    });

    test('monta CSV com BOM, delimitadores, escape, valores e total', () => {
        const csv = montarCsvAtendimentos({
            periodo: { de: '2026-01-01', ate: '2026-01-31' },
            itens: [
                {
                    nome: 'Corte; "clássico"',
                    quantidade: 2,
                    quantidadeAvulso: 1,
                    quantidadePacote: 1,
                    valorEstimado: '123.50',
                    semPreco: 1,
                },
                {
                    nome: '=1+1',
                    quantidade: 1,
                    quantidadeAvulso: 1,
                    quantidadePacote: 0,
                    valorEstimado: null,
                    semPreco: 1,
                },
                {
                    nome: '+Barba',
                    quantidade: 0,
                    quantidadeAvulso: 0,
                    quantidadePacote: 0,
                    valorEstimado: null,
                    semPreco: 0,
                },
                {
                    nome: '-Sobrancelha',
                    quantidade: 0,
                    quantidadeAvulso: 0,
                    quantidadePacote: 0,
                    valorEstimado: null,
                    semPreco: 0,
                },
                {
                    nome: '@Planilha',
                    quantidade: 0,
                    quantidadeAvulso: 0,
                    quantidadePacote: 0,
                    valorEstimado: null,
                    semPreco: 0,
                },
            ],
            total: { quantidade: 3, valorEstimado: '123.50', semPreco: 2 },
        });

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain(
            'Serviço;Atendimentos;Avulso;Pacote;Valor estimado (R$);Sem preço',
        );
        expect(csv).toContain('"Corte; ""clássico""";2;1;1;123,50;1');
        expect(csv).toContain("'=1+1;1;1;0;;1");
        expect(csv).toContain("'+Barba;0;0;0;;0");
        expect(csv).toContain("'-Sobrancelha;0;0;0;;0");
        expect(csv).toContain("'@Planilha;0;0;0;;0");
        expect(csv).toContain('TOTAL;3;2;1;123,50;2');
        expect(csv.replaceAll('\r\n', '')).not.toContain('\n');
        expect(csv.split('\r\n')).toHaveLength(7);
    });

    test('formata BRL só para exibição e null como traço', () => {
        expect(formatarValorEstimado('123.50')).toBe('R$ 123,50');
        expect(formatarValorEstimado(null)).toBe('—');
    });
});
