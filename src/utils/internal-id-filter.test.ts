import { describe, expect, it } from 'vitest';
import { removerIdsInternos } from './internal-id-filter';

const firstId = 'c123456789012345678901234';
const secondId = 'c223456789012345678901234';

describe('removerIdsInternos', () => {
    it('remove IDs do exemplo de mensagem de produção', () => {
        expect(
            removerIdsInternos(
                `Corte (${firstId}) e Sobrancelha (${secondId}), podemos seguir?`,
            ),
        ).toEqual({
            text: 'Corte e Sobrancelha, podemos seguir?',
            count: 2,
        });
    });

    it('remove ID isolado, IDs múltiplos e grupo entre colchetes', () => {
        expect(removerIdsInternos(`${firstId} ${secondId}`)).toEqual({
            text: '',
            count: 2,
        });
        expect(
            removerIdsInternos(`Serviços [${firstId}, ${secondId}]`),
        ).toEqual({
            text: 'Serviços',
            count: 2,
        });
    });

    it('remove parênteses contendo dois IDs separados por “e” ou espaço', () => {
        expect(removerIdsInternos(`Corte (${firstId} e ${secondId})`)).toEqual({
            text: 'Corte',
            count: 2,
        });
        expect(removerIdsInternos(`Corte (${firstId} ${secondId})`)).toEqual({
            text: 'Corte',
            count: 2,
        });
    });

    it('limpa espaço antes de pontuação quando ID termina frase', () => {
        expect(removerIdsInternos(`Corte ${firstId}.`)).toEqual({
            text: 'Corte.',
            count: 1,
        });
    });

    it('preserva texto sem ID e rejeita falsos positivos', () => {
        const text =
            'cabcdefghijklmnopqrstuvwx  5511999999999\t17/10/2026\n texto';

        expect(removerIdsInternos(text)).toEqual({ text, count: 0 });
    });

    it('preserva quebras de linha e limpa espaços de cada linha', () => {
        expect(
            removerIdsInternos(`  Corte (${firstId})  \r\n  Barba  `),
        ).toEqual({ text: 'Corte\r\nBarba', count: 1 });
    });

    it('retorna texto vazio quando mensagem contém somente ID', () => {
        expect(removerIdsInternos(firstId)).toEqual({ text: '', count: 1 });
    });
});
