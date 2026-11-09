import { fromZonedTime } from 'date-fns-tz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    calcularCorteAutoConclusao,
    estaDentroDaJanelaEstorno,
    getAutoConclusaoConfig,
} from './auto-conclusao';

const TIME_ZONE = 'America/Sao_Paulo';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('configuração de conclusão automática', () => {
    it('mantém feature desligada por padrão', () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');
        vi.stubEnv('AUTO_CONCLUSAO_A_PARTIR_DE', '');
        expect(getAutoConclusaoConfig()).toMatchObject({
            enabled: false,
            aPartirDe: null,
            horaLocal: 6,
            intervaloMs: 900000,
            loteMaximo: 50,
            janelaEstornoHoras: 48,
        });
    });

    it('lê limites de estorno e scheduler com feature desligada', () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'false');
        vi.stubEnv('AUTO_CONCLUSAO_A_PARTIR_DE', '');
        vi.stubEnv('JANELA_ESTORNO_HORAS', '24');
        vi.stubEnv('AUTO_CONCLUSAO_HORA_LOCAL', '7');
        vi.stubEnv('AUTO_CONCLUSAO_INTERVALO_MS', '30000');
        vi.stubEnv('AUTO_CONCLUSAO_LOTE_MAXIMO', '20');

        expect(getAutoConclusaoConfig()).toMatchObject({
            enabled: false,
            aPartirDe: null,
            janelaEstornoHoras: 24,
            horaLocal: 7,
            intervaloMs: 30000,
            loteMaximo: 20,
        });
    });

    it('exige data inicial válida quando feature está ligada', () => {
        vi.stubEnv('AUTO_CONCLUSAO_ENABLED', 'true');
        vi.stubEnv('AUTO_CONCLUSAO_A_PARTIR_DE', '');
        expect(() => getAutoConclusaoConfig()).toThrow(
            'AUTO_CONCLUSAO_A_PARTIR_DE inválida ou ausente',
        );

        vi.stubEnv('AUTO_CONCLUSAO_A_PARTIR_DE', '2026-02-30');
        expect(() => getAutoConclusaoConfig()).toThrow(
            'AUTO_CONCLUSAO_A_PARTIR_DE inválida: informe data válida',
        );
    });
});

describe('calcularCorteAutoConclusao', () => {
    it('usa meia-noite de ontem antes das 06:00, inclusive na virada local', () => {
        const agora = fromZonedTime('2026-11-08T05:59:59', TIME_ZONE);
        expect(calcularCorteAutoConclusao(agora, 6)).toEqual(
            fromZonedTime('2026-11-07T00:00:00', TIME_ZONE),
        );
    });

    it('usa meia-noite de hoje a partir das 06:00 local', () => {
        const agora = fromZonedTime('2026-11-08T06:00:00', TIME_ZONE);
        expect(calcularCorteAutoConclusao(agora, 6)).toEqual(
            fromZonedTime('2026-11-08T00:00:00', TIME_ZONE),
        );
    });
});

describe('estaDentroDaJanelaEstorno', () => {
    const agora = new Date('2026-11-08T12:00:00.000Z');

    it('aceita conclusão dentro da janela e rejeita antiga ou futura', () => {
        expect(
            estaDentroDaJanelaEstorno(
                new Date(agora.getTime() - 48 * 60 * 60 * 1000),
                agora,
                48,
            ),
        ).toBe(true);
        expect(
            estaDentroDaJanelaEstorno(
                new Date(agora.getTime() - 48 * 60 * 60 * 1000 - 1),
                agora,
                48,
            ),
        ).toBe(false);
        expect(
            estaDentroDaJanelaEstorno(new Date(agora.getTime() + 1), agora, 48),
        ).toBe(false);
    });
});
