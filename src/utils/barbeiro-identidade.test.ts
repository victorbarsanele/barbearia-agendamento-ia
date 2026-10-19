import { describe, expect, it } from 'vitest';
import { carregarIdentidadeBarbeiro } from './barbeiro-identidade';

describe('carregarIdentidadeBarbeiro', () => {
    it.each([{}, { BARBER_NAME: '' }, { BARBER_NAME: '   ' }])(
        'retorna null sem nome configurado: %s',
        (env) => {
            expect(carregarIdentidadeBarbeiro(env)).toBeNull();
        },
    );

    it('inclui nome composto e primeiro nome quando não há apelidos', () => {
        expect(
            carregarIdentidadeBarbeiro({ BARBER_NAME: 'Carlos da Silva' }),
        ).toEqual({
            nome: 'Carlos da Silva',
            nomesAceitos: ['Carlos da Silva', 'Carlos'],
        });
    });

    it('limpa apelidos, expande formas sem acento e elimina duplicatas', () => {
        expect(
            carregarIdentidadeBarbeiro({
                BARBER_NAME: 'Carlos Silva',
                BARBER_ALIASES: ' Cacá, , caca, CACÁ, Mário, mario ',
            }),
        ).toEqual({
            nome: 'Carlos Silva',
            nomesAceitos: [
                'Carlos Silva',
                'Carlos',
                'Cacá',
                'Caca',
                'Mário',
                'Mario',
            ],
        });
    });
});
