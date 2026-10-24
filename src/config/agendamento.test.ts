import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAgendamentoConfig, validarAgendamentoConfig } from './agendamento';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('agendamento configuration', () => {
    it('uses defaults when environment variables are unset', () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', undefined);
        vi.stubEnv('OFERTA_FOLGA_MINUTOS', undefined);
        vi.stubEnv('CONFIRMACAO_TOLERANCIA_MINUTOS', undefined);
        vi.stubEnv('AVISO_CURTO_PRAZO_MINUTOS', undefined);

        expect(getAgendamentoConfig()).toEqual({
            minAntecedenciaMinutos: 60,
            ofertaFolgaMinutos: 0,
            confirmacaoToleranciaMinutos: 0,
            avisoCurtoPrazoMinutos: 60,
        });
        expect(validarAgendamentoConfig).not.toThrow();
    });

    it.each([
        ['MIN_ANTECEDENCIA_MINUTOS', '-1', '0 e 1440'],
        ['MIN_ANTECEDENCIA_MINUTOS', 'texto', '0 e 1440'],
        ['MIN_ANTECEDENCIA_MINUTOS', '1441', '0 e 1440'],
        ['OFERTA_FOLGA_MINUTOS', '-1', '0 e 120'],
        ['OFERTA_FOLGA_MINUTOS', 'texto', '0 e 120'],
        ['OFERTA_FOLGA_MINUTOS', '121', '0 e 120'],
        ['CONFIRMACAO_TOLERANCIA_MINUTOS', '-1', '0 e 60'],
        ['CONFIRMACAO_TOLERANCIA_MINUTOS', 'texto', '0 e 60'],
        ['CONFIRMACAO_TOLERANCIA_MINUTOS', '61', '0 e 60'],
        ['AVISO_CURTO_PRAZO_MINUTOS', '-1', '0 e 1440'],
        ['AVISO_CURTO_PRAZO_MINUTOS', 'texto', '0 e 1440'],
        ['AVISO_CURTO_PRAZO_MINUTOS', '1441', '0 e 1440'],
    ])('rejects %s=%s outside integer range', (name, value, range) => {
        vi.stubEnv(name, value);

        expect(() => validarAgendamentoConfig()).toThrow(
            `${name} inválida: valor recebido "${value}". Informe um inteiro entre ${range}.`,
        );
    });
});
