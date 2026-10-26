import { describe, expect, it } from 'vitest';
import { descreverErroSeguro } from './safe-error';

describe('descreverErroSeguro', () => {
    it('extrai código e alvo de erro Prisma conhecido', () => {
        const erro = Object.assign(new Error('must never appear'), {
            name: 'PrismaClientKnownRequestError',
            code: 'P2028',
            meta: { target: ['agendamentoId'] },
            stack: 'private stack',
        });

        expect(descreverErroSeguro(erro)).toEqual({
            nome: 'PrismaClientKnownRequestError',
            codigo: 'P2028',
            alvo: ['agendamentoId'],
        });
        expect(JSON.stringify(descreverErroSeguro(erro))).not.toContain(
            'must never appear',
        );
        expect(JSON.stringify(descreverErroSeguro(erro))).not.toContain(
            'private stack',
        );
    });

    it('extrai originalCode de DriverAdapterError.cause', () => {
        const erro = Object.assign(new Error('hidden driver message'), {
            name: 'DriverAdapterError',
            cause: {
                kind: 'postgres',
                code: '23505',
                originalCode: '23505',
                message: 'hidden payload',
                column: 'telefone',
            },
        });

        expect(descreverErroSeguro(erro)).toEqual({
            nome: 'DriverAdapterError',
            codigo: '23505',
        });
    });

    it('extrai código de driver aninhado em meta Prisma', () => {
        const erro = {
            name: 'PrismaClientKnownRequestError',
            code: 'P2002',
            meta: {
                driverAdapterError: {
                    cause: { kind: 'postgres', originalCode: '23505' },
                },
            },
        };

        expect(descreverErroSeguro(erro)).toEqual({
            nome: 'PrismaClientKnownRequestError',
            codigo: 'P2002',
        });
    });

    it('reduz erro genérico a nome seguro', () => {
        expect(
            descreverErroSeguro(new TypeError('secret payload in message')),
        ).toEqual({ nome: 'TypeError' });
        expect(descreverErroSeguro('secret thrown value')).toEqual({
            nome: 'UnknownError',
        });
    });

    it('descarta códigos e alvos fora dos formatos permitidos', () => {
        const erro = {
            name: 'Error',
            code: 'SQLSTATE-23505',
            meta: {
                target: ['agendamentoId', 'value with spaces'],
                column: 'telefone;DROP',
            },
        };

        expect(descreverErroSeguro(erro)).toEqual({ nome: 'Error' });
    });

    it('nunca retorna message nem stack', () => {
        const erro = Object.assign(new Error('secret message'), {
            code: 'ETIMEDOUT',
            stack: 'secret stack',
        });
        const descricao = descreverErroSeguro(erro);

        expect(Object.keys(descricao)).toEqual(['nome', 'codigo']);
        expect(JSON.stringify(descricao)).not.toContain('secret');
    });
});
