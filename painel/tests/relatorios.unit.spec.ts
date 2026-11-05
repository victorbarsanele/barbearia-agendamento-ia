import { expect, test } from '@playwright/test';
import {
    calcularPeriodoAtalho,
    formatarDataRelatorio,
    formatarValorEstimado,
    montarCsvAtendimentos,
    validarIntervaloRelatorio,
} from '../src/utils/relatorios.js';
import {
    formatarTelefoneCliente,
    formatarTelefoneCsv,
    montarCsvClientesInativos,
    nomeArquivoCsvClientesInativos,
    obterTelefoneWhatsApp,
    validarIntervaloDiasInativos,
} from '../src/utils/clientesInativos.js';
import type { ItemClienteInativo } from '../src/services/relatorios.service.js';
import type {
    ItemSaldoPacote,
    RelatorioSaldoPacotes,
} from '../src/services/relatorios.service.js';
import {
    formatarSaldoServico,
    formatarTextoUltimaVisita,
    montarCsvSaldoPacotes,
    nomeArquivoCsvSaldoPacotes,
    obterSituacaoPacote,
    validarDiasParado,
} from '../src/utils/saldoPacotes.js';

const clienteInativo: ItemClienteInativo = {
    clienteId: 'cliente-1',
    nome: '@Ana Silva',
    telefone: '+55 (11) 99999-9999',
    ultimaVisita: '2026-01-02',
    diasSemVir: 45,
    ultimoServico: '=Corte; clássico',
    totalVisitas: 8,
    pacoteAtivoComSaldo: true,
    ultimaTentativa: null,
    podeReativar: true,
    reativacaoBloqueio: null,
    reativacaoBloqueadaAte: null,
};

const pacoteBase: ItemSaldoPacote = {
    pacoteClienteId: 'pacote-cliente-1',
    clienteId: 'cliente-1',
    nome: 'Ana Silva',
    telefone: '+55 (11) 99999-9999',
    pacoteNome: 'Pacote mensal',
    dataInicio: '2026-01-02',
    ultimaVisita: '2026-02-01',
    semVisita: false,
    diasSemVir: 40,
    temHorarioMarcado: false,
    parado: true,
    totalRestante: 2,
    totalAgendados: 1,
    aConcluir: 0,
    servicos: [
        {
            servicoId: 'servico-corte',
            nome: 'Corte e Barba',
            total: 4,
            restante: 2,
            agendados: 1,
        },
    ],
};

function relatorioPacotes(
    itens: ItemSaldoPacote[],
    somenteParados = false,
): RelatorioSaldoPacotes {
    return {
        geradoEm: '2026-03-16T02:00:00.000Z',
        filtro: { diasParado: 7, somenteParados },
        totalAtivos: itens.length,
        totalParados: itens.filter((item) => item.parado).length,
        total: itens.length,
        truncado: false,
        itens,
    };
}

test.describe('helpers de relatórios', () => {
    test('valida diasParado vazio, fração e limites', () => {
        expect(validarDiasParado('')).toContain('Informe');
        expect(validarDiasParado('1.5')).toContain('inteiro');
        expect(validarDiasParado('0')).toContain('1 e 365');
        expect(validarDiasParado('1')).toBeNull();
        expect(validarDiasParado('365')).toBeNull();
        expect(validarDiasParado('366')).toContain('1 e 365');
    });

    test('formata saldo por serviço com contagem de marcados', () => {
        expect(formatarSaldoServico(pacoteBase.servicos[0])).toBe(
            'Corte e Barba: 2 de 4 (1 marcado)',
        );
        expect(
            formatarSaldoServico({ ...pacoteBase.servicos[0], agendados: 0 }),
        ).toBe('Corte e Barba: 2 de 4');
        expect(
            formatarSaldoServico({ ...pacoteBase.servicos[0], agendados: 2 }),
        ).toBe('Corte e Barba: 2 de 4 (2 marcados)');
    });

    test('prioriza situação parado, horário marcado e retorno', () => {
        expect(obterSituacaoPacote(pacoteBase)).toBe('Parado');
        expect(
            obterSituacaoPacote({
                ...pacoteBase,
                parado: false,
                temHorarioMarcado: true,
            }),
        ).toBe('Horário marcado');
        expect(
            obterSituacaoPacote({
                ...pacoteBase,
                parado: false,
                temHorarioMarcado: false,
            }),
        ).toBe('Aguardando retorno');
    });

    test('formata texto de última visita e pacote sem visitas', () => {
        expect(formatarTextoUltimaVisita(pacoteBase)).toBe(
            'Última visita: 01/02/2026 · há 40 dias',
        );
        expect(
            formatarTextoUltimaVisita({
                ...pacoteBase,
                ultimaVisita: null,
                semVisita: true,
            }),
        ).toBe('Nunca veio · pacote desde 02/01/2026 (há 40 dias)');
    });

    test('monta CSV de pacotes com BOM, CRLF e conteúdo neutralizado', () => {
        const csv = montarCsvSaldoPacotes(
            relatorioPacotes([
                {
                    ...pacoteBase,
                    nome: '=Ana; "Silva"',
                    pacoteNome: '+Pacote',
                    servicos: [
                        {
                            ...pacoteBase.servicos[0],
                            nome: '=Corte; "social"',
                        },
                        {
                            servicoId: 'servico-barba',
                            nome: 'Barba',
                            total: 2,
                            restante: 1,
                            agendados: 0,
                        },
                    ],
                },
                {
                    ...pacoteBase,
                    clienteId: 'cliente-10-digitos',
                    nome: 'Carlos',
                    telefone: '11 3333-4444',
                    parado: false,
                    temHorarioMarcado: true,
                    totalAgendados: 1,
                },
                {
                    ...pacoteBase,
                    clienteId: 'cliente-nunca-veio',
                    nome: '  ',
                    telefone: 'telefone inválido',
                    ultimaVisita: null,
                    semVisita: true,
                    parado: false,
                    temHorarioMarcado: false,
                    aConcluir: 1,
                },
            ]),
        );

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain(
            'Cliente;Telefone;Pacote;Início;Última visita;Dias sem vir;Situação;Restante total;Marcados;A concluir;Saldo por serviço',
        );
        expect(csv).toContain(
            '"\'=Ana; ""Silva""";(11) 99999-9999;\'+Pacote;02/01/2026;01/02/2026;40;Parado;2;1;0;"\'=Corte; ""social"": 2 de 4 (1 marcado) | Barba: 1 de 2"',
        );
        expect(csv).toContain(
            'Carlos;(11) 3333-4444;Pacote mensal;02/01/2026;01/02/2026;40;Horário marcado;2;1;0;',
        );
        expect(csv).toContain(
            '(sem nome);telefone inválido;Pacote mensal;02/01/2026;Nunca veio;40;Aguardando retorno;2;1;1;',
        );
        expect(csv.split('\r\n')).toHaveLength(4);
        expect(csv.replaceAll('\r\n', '')).not.toContain('\n');
        expect(csv).not.toContain('11 99999-9999');
        expect(csv).not.toContain('5511999999999');
    });

    test('neutraliza = + - @ em cliente, pacote e serviços', () => {
        const prefixos = ['=', '+', '-', '@'];
        const itens = prefixos.map((prefixo) => ({
            ...pacoteBase,
            clienteId: `cliente-${prefixo}`,
            nome: `${prefixo}Cliente`,
            pacoteNome: `${prefixo}Pacote`,
            servicos: [{ ...pacoteBase.servicos[0], nome: `${prefixo}Corte` }],
        }));
        const csv = montarCsvSaldoPacotes(relatorioPacotes(itens));

        for (const prefixo of prefixos) {
            expect(csv).toContain(`'${prefixo}Cliente;`);
            expect(csv).toContain(`;'${prefixo}Pacote;`);
            expect(csv).toContain(`;'${prefixo}Corte:`);
        }
    });

    test('nomeia CSV por data local e filtro somente parados', () => {
        const relatorio = relatorioPacotes([pacoteBase], true);
        expect(nomeArquivoCsvSaldoPacotes(relatorio)).toBe(
            'saldo-pacotes_2026-03-15_parado7d_so-parados.csv',
        );
        expect(
            nomeArquivoCsvSaldoPacotes({
                ...relatorio,
                filtro: { diasParado: 15, somenteParados: false },
            }),
        ).toBe('saldo-pacotes_2026-03-15_parado15d.csv');
    });

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

    test('valida limites inteiros do intervalo de clientes inativos', () => {
        expect(validarIntervaloDiasInativos(30, 180)).toBeNull();
        expect(validarIntervaloDiasInativos(1, 180)).toBeNull();
        expect(validarIntervaloDiasInativos(365, 730)).toBeNull();
        expect(validarIntervaloDiasInativos(1, 730)).toBeNull();
        expect(validarIntervaloDiasInativos(Number.NaN, 180)).toContain(
            'inteiro',
        );
        expect(validarIntervaloDiasInativos(0, 180)).toContain('1 e 365');
        expect(validarIntervaloDiasInativos(366, 730)).toContain('1 e 365');
        expect(validarIntervaloDiasInativos(30.5, 180)).toContain('inteiro');
        expect(validarIntervaloDiasInativos(60, 59)).toContain(
            'igual ou maior',
        );
        expect(validarIntervaloDiasInativos(30, 731)).toContain('até 730');
    });

    test('normaliza WhatsApp apenas para quantidades de dígitos aceitas', () => {
        expect(obterTelefoneWhatsApp('(11) 99999-9999')).toBe('5511999999999');
        expect(obterTelefoneWhatsApp('11 3333-4444')).toBe('551133334444');
        expect(obterTelefoneWhatsApp('+55 (11) 99999-9999')).toBe(
            '5511999999999',
        );
        expect(obterTelefoneWhatsApp('551133334444')).toBe('551133334444');
        expect(obterTelefoneWhatsApp('55123456789')).toBe('5555123456789');
        expect(obterTelefoneWhatsApp('5511999999999')).toBe('5511999999999');
        expect(obterTelefoneWhatsApp('')).toBeNull();
        expect(obterTelefoneWhatsApp('telefone')).toBeNull();
        expect(obterTelefoneWhatsApp('123456789')).toBeNull();
        expect(obterTelefoneWhatsApp('441199999999')).toBeNull();
        expect(obterTelefoneWhatsApp('4411999999999')).toBeNull();
        expect(obterTelefoneWhatsApp('55119999999999')).toBeNull();
    });

    test('formata telefone CSV nacional e neutraliza valores inválidos', () => {
        const telefonesValidos = [
            ['1133334444', '(11) 3333-4444'],
            ['(11) 3333-4444', '(11) 3333-4444'],
            ['11999999999', '(11) 99999-9999'],
            ['(11) 99999-9999', '(11) 99999-9999'],
            ['551133334444', '(11) 3333-4444'],
            ['+55 (11) 3333-4444', '(11) 3333-4444'],
            ['5511999999999', '(11) 99999-9999'],
            ['+55 (11) 99999-9999', '(11) 99999-9999'],
        ];

        for (const [entrada, esperado] of telefonesValidos) {
            const resultado = formatarTelefoneCsv(entrada);
            expect(resultado).toBe(esperado);
            expect(/^[=+\-@]/.test(resultado)).toBe(false);
        }

        expect(formatarTelefoneCsv('+telefone')).toBe("'+telefone");
        expect(formatarTelefoneCsv('=inválido')).toBe("'=inválido");
        expect(formatarTelefoneCsv('-inválido')).toBe("'-inválido");
        expect(formatarTelefoneCsv('@inválido')).toBe("'@inválido");
        expect(formatarTelefoneCsv('')).toBe('');
    });

    test('monta CSV com BOM, CRLF, cabeçalho, escapes e valores protegidos', () => {
        const csv = montarCsvClientesInativos([
            clienteInativo,
            {
                ...clienteInativo,
                clienteId: 'cliente-10-digitos',
                nome: 'Carlos',
                telefone: '11 3333-4444',
                ultimoServico: 'Corte "social"; barba',
                pacoteAtivoComSaldo: false,
            },
            {
                ...clienteInativo,
                clienteId: 'cliente-sem-nome',
                nome: '  ',
                telefone: '+telefone',
                ultimoServico: null,
                pacoteAtivoComSaldo: false,
            },
            {
                ...clienteInativo,
                clienteId: 'cliente-sem-telefone',
                nome: 'Duda',
                telefone: '',
                pacoteAtivoComSaldo: false,
            },
        ]);

        expect(csv.charCodeAt(0)).toBe(0xfeff);
        expect(csv).toContain(
            'Cliente;Telefone;Última visita;Dias sem vir;Último serviço;Visitas;Pacote ativo com saldo',
        );
        expect(csv).toContain(
            '\'@Ana Silva;(11) 99999-9999;02/01/2026;45;"\'=Corte; clássico";8;Sim',
        );
        expect(csv).toContain(
            'Carlos;(11) 3333-4444;02/01/2026;45;"Corte ""social""; barba";8;Não',
        );
        expect(csv).toContain("(sem nome);'+telefone;02/01/2026;45;;8;Não");
        expect(csv).toContain('Duda;;02/01/2026;45;"\'=Corte; clássico";8;Não');
        expect(csv).toBe(
            [
                '\uFEFFCliente;Telefone;Última visita;Dias sem vir;Último serviço;Visitas;Pacote ativo com saldo',
                '\'@Ana Silva;(11) 99999-9999;02/01/2026;45;"\'=Corte; clássico";8;Sim',
                'Carlos;(11) 3333-4444;02/01/2026;45;"Corte ""social""; barba";8;Não',
                "(sem nome);'+telefone;02/01/2026;45;;8;Não",
                'Duda;;02/01/2026;45;"\'=Corte; clássico";8;Não',
            ].join('\r\n'),
        );
    });

    test('usa data de São Paulo no nome do CSV e mostra telefone vazio com fallback', () => {
        expect(
            nomeArquivoCsvClientesInativos({
                geradoEm: '2026-03-16T02:00:00.000Z',
            }),
        ).toBe('clientes_inativos_2026-03-15.csv');
        expect(formatarTelefoneCliente('   ')).toBe('Não informado');
    });
});
