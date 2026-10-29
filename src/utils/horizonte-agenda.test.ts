import { describe, expect, it } from 'vitest';
import {
    calcularDiasNoCalendario,
    calcularHorizonteAgenda,
    HORIZONTE_PADRAO_DIAS,
} from './horizonte-agenda';

describe('calcularHorizonteAgenda', () => {
    it('usa janela padrão de 20 dias quando configuração está vazia', () => {
        expect(HORIZONTE_PADRAO_DIAS).toBe(20);
        expect(
            calcularHorizonteAgenda('2026-11-15', {
                horizonteDias: null,
                limiteAte: null,
            }),
        ).toBe('2026-12-05');
    });

    it('usa somente horizonteDias quando informado', () => {
        expect(
            calcularHorizonteAgenda('2026-11-15', {
                horizonteDias: 30,
                limiteAte: null,
            }),
        ).toBe('2026-12-15');
    });

    it('teto posterior à janela não estende horizonte padrão', () => {
        expect(
            calcularHorizonteAgenda('2026-11-15', {
                horizonteDias: null,
                limiteAte: '2026-12-20',
            }),
        ).toBe('2026-12-05');
    });

    it('usa teto quando janela configurada ultrapassa limite', () => {
        expect(
            calcularHorizonteAgenda('2026-11-20', {
                horizonteDias: 30,
                limiteAte: '2026-12-15',
            }),
        ).toBe('2026-12-15');
        expect(
            calcularHorizonteAgenda('2026-10-20', {
                horizonteDias: 30,
                limiteAte: '2026-12-15',
            }),
        ).toBe('2026-11-19');
    });

    it('ignora teto vencido e permite teto igual a hoje', () => {
        expect(
            calcularHorizonteAgenda('2026-11-15', {
                horizonteDias: 30,
                limiteAte: '2026-11-14',
            }),
        ).toBe('2026-12-15');
        expect(
            calcularHorizonteAgenda('2026-11-15', {
                horizonteDias: 30,
                limiteAte: '2026-11-15',
            }),
        ).toBe('2026-11-15');
    });

    it('calcula janela inclusiva e atravessa mês e ano', () => {
        const horizonte = calcularHorizonteAgenda('2026-12-25', {
            horizonteDias: 10,
            limiteAte: null,
        });

        expect(horizonte).toBe('2027-01-04');
        expect(calcularDiasNoCalendario('2026-12-25', horizonte)).toBe(11);
        expect(calcularDiasNoCalendario('2026-11-15', '2026-11-15')).toBe(1);
    });
});
