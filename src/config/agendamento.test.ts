import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAgendamentoConfig, validarAgendamentoConfig } from './agendamento';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('agendamento configuration', () => {
    it('uses defaults when environment variables are unset', () => {
        vi.stubEnv('MIN_ANTECEDENCIA_MINUTOS', undefined);
        vi.stubEnv('OFERTA_FOLGA_MINUTOS', undefined);

        expect(getAgendamentoConfig()).toEqual({
            minAntecedenciaMinutos: 60,
            ofertaFolgaMinutos: 0,
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
    ])('rejects %s=%s outside integer range', (name, value, range) => {
        vi.stubEnv(name, value);

        expect(() => validarAgendamentoConfig()).toThrow(
            `${name} inválida: valor recebido "${value}". Informe um inteiro entre ${range}.`,
        );
    });
});
