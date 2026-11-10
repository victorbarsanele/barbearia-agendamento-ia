import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getVinculoAutomaticoWhatsappEnabled,
    validarVinculoAutomaticoWhatsappConfig,
} from './vinculo-automatico-whatsapp';

const variavel = 'VINCULO_AUTOMATICO_WHATSAPP_ENABLED';

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('vínculo automático WhatsApp config', () => {
    it('usa false como padrão', () => {
        vi.stubEnv(variavel, undefined);

        expect(getVinculoAutomaticoWhatsappEnabled()).toBe(false);
        expect(validarVinculoAutomaticoWhatsappConfig).not.toThrow();
    });

    it.each([
        ['true', true],
        ['false', false],
    ])('aceita somente %s', (valor, esperado) => {
        vi.stubEnv(variavel, valor);

        expect(getVinculoAutomaticoWhatsappEnabled()).toBe(esperado);
    });

    it.each(['TRUE', 'False', '1', '', ' true '])(
        'rejeita valor inválido %j',
        (valor) => {
            vi.stubEnv(variavel, valor);

            expect(() => validarVinculoAutomaticoWhatsappConfig()).toThrow(
                `${variavel} inválida: valor recebido "${valor}". Informe "true" ou "false".`,
            );
        },
    );
});
