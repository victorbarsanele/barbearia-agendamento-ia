import { describe, expect, it } from 'vitest';
import { detectarPedidoHumano } from './pedido-humano';

const identidade = {
    nome: 'Leonardo Almeida',
    nomesAceitos: ['Leonardo Almeida', 'Leonardo', 'Leo', 'Léo'],
};

describe('detectarPedidoHumano', () => {
    it.each([
        'Consigo falar com o Leo?',
        'queria falar com o Leonardo',
        'chama o Leo pra mim',
        'me chama o Leo, por favor',
        'me passa para o Leonardo',
        'tem como o barbeiro me responder?',
        'quero falar com um atendente',
        'falar com alguém',
        'FALAR COM ALGUEM',
        'QUERO FALAR COM O LÉO',
        'quero falar com o barbeiro',
        'tem como dar um jeito?',
        'encaixa só eu',
        'só uma exceção',
        'quero uma exceção',
        'pode abrir uma exceção?',
        'faz uma exceção pra mim',
        'pode verificar se tem encaixe?',
        'tem encaixe hoje?',
        'tem como me atender fora do expediente?',
        'não consigo ir no horário, tem como dar um jeito?',
        'consegue me atender fora do horário?',
        'quero um encaixe hoje',
        'passa pro Leo',
        'me chama o Leonardo',
        'quero falar com o dono',
    ])('detecta pedido explícito: %s', (message) => {
        expect(detectarPedidoHumano(message, identidade)).toBe(true);
    });

    it.each([
        'oi léo, queria marcar um corte',
        'meu nome é Leonardo',
        'o Leo corta bem?',
        'tem horário amanhã?',
        'não tem horário amanhã',
        'não há vaga para amanhã',
        'não tem horário bom pra mim',
        'não tem encaixe disponível',
        'não quero um encaixe',
        'não quero falar com humano',
        'não precisa chamar o Leo',
        'sem atendente',
        'não preciso de atendente',
        'fora do expediente, por favor',
        'não quero exceção',
        'sem exceção',
        'vocês atendem depois das 19h?',
        'até que horas abre hoje?',
        'abre domingo?',
        'tem horário depois do almoço?',
        'não tem encaixe, né?',
        'o Leo atende hoje?',
        'o Leo tá aí?',
    ])('não detecta menção sem pedido: %s', (message) => {
        expect(detectarPedidoHumano(message, identidade)).toBe(false);
    });

    it('não detecta nome quando identidade não está configurada', () => {
        expect(detectarPedidoHumano('queria falar com o Leo', null)).toBe(
            false,
        );
    });
});
