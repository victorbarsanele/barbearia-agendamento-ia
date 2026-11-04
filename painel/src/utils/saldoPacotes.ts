import type {
    ItemSaldoPacote,
    RelatorioSaldoPacotes,
    ServicoSaldoPacote,
} from '../services/relatorios.service.js';
import { getBrazilDateKey } from './dateTime.js';
import { neutralizarFormulaCsv, serializarCsv } from './csv.js';
import { formatarTelefoneCsv } from './contatoRelatorio.js';
import { formatarDataRelatorio } from './relatorios.js';

export function validarDiasParado(valor: string): string | null {
    if (!valor.trim()) return 'Informe dias sem vir.';

    const dias = Number(valor);
    if (!Number.isInteger(dias)) {
        return 'Informe um número inteiro entre 1 e 365.';
    }
    if (dias < 1 || dias > 365) {
        return 'Informe um número entre 1 e 365.';
    }
    return null;
}

export function formatarSaldoServico(servico: ServicoSaldoPacote): string {
    const marcado = servico.agendados
        ? ` (${servico.agendados} marcado${servico.agendados === 1 ? '' : 's'})`
        : '';
    return `${servico.nome}: ${servico.restante} de ${servico.total}${marcado}`;
}

export function obterSituacaoPacote(item: ItemSaldoPacote): string {
    if (item.parado) return 'Parado';
    if (item.temHorarioMarcado) return 'Horário marcado';
    return 'Aguardando retorno';
}

export function formatarTextoUltimaVisita(item: ItemSaldoPacote): string {
    if (item.semVisita) {
        return `Nunca veio · pacote desde ${formatarDataRelatorio(item.dataInicio)} (há ${item.diasSemVir} dias)`;
    }
    return `Última visita: ${formatarDataRelatorio(item.ultimaVisita ?? '')} · há ${item.diasSemVir} dias`;
}

export function montarCsvSaldoPacotes(
    relatorio: RelatorioSaldoPacotes,
): string {
    const linhas: (string | number | null)[][] = [
        [
            'Cliente',
            'Telefone',
            'Pacote',
            'Início',
            'Última visita',
            'Dias sem vir',
            'Situação',
            'Restante total',
            'Marcados',
            'A concluir',
            'Saldo por serviço',
        ],
        ...relatorio.itens.map((item) => [
            neutralizarFormulaCsv(item.nome.trim() || '(sem nome)'),
            formatarTelefoneCsv(item.telefone),
            neutralizarFormulaCsv(item.pacoteNome),
            formatarDataRelatorio(item.dataInicio),
            item.semVisita
                ? 'Nunca veio'
                : formatarDataRelatorio(item.ultimaVisita ?? ''),
            item.diasSemVir,
            obterSituacaoPacote(item),
            item.totalRestante,
            item.totalAgendados,
            item.aConcluir,
            item.servicos
                .map((servico) =>
                    formatarSaldoServico({
                        ...servico,
                        nome: neutralizarFormulaCsv(servico.nome),
                    }),
                )
                .join(' | '),
        ]),
    ];

    return serializarCsv(linhas);
}

export function nomeArquivoCsvSaldoPacotes(
    relatorio: RelatorioSaldoPacotes,
): string {
    const instante = new Date(relatorio.geradoEm);
    const dataLocal = Number.isNaN(instante.getTime())
        ? 'data-indisponivel'
        : getBrazilDateKey(instante);
    const somenteParados = relatorio.filtro.somenteParados ? '_so-parados' : '';
    return `saldo-pacotes_${dataLocal}_parado${relatorio.filtro.diasParado}d${somenteParados}.csv`;
}
