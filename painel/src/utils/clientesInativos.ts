import {
    type ItemClienteInativo,
    type RelatorioClientesInativos,
} from '../services/relatorios.service.js';
import { getBrazilDateKey } from './dateTime.js';
import { formatarTelefone } from './formatarTelefone.js';
import { neutralizarFormulaCsv, serializarCsv } from './csv.js';
import { formatarDataRelatorio } from './relatorios.js';

export function validarIntervaloDiasInativos(
    diasMin: number,
    diasMax: number,
): string | null {
    if (!Number.isInteger(diasMin) || diasMin < 1 || diasMin > 365) {
        return 'O mínimo deve ser um número inteiro entre 1 e 365.';
    }
    if (!Number.isInteger(diasMax) || diasMax < diasMin || diasMax > 730) {
        return 'O máximo deve ser um inteiro igual ou maior que o mínimo, até 730.';
    }
    return null;
}

export function obterTelefoneWhatsApp(telefone: string): string | null {
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length === 10 || digitos.length === 11) {
        return `55${digitos}`;
    }
    if (
        (digitos.length === 12 || digitos.length === 13) &&
        digitos.startsWith('55')
    ) {
        return digitos;
    }
    return null;
}

export function formatarTelefoneCsv(telefone: string): string {
    const digitos = telefone.replace(/\D/g, '');
    const nacional =
        (digitos.length === 12 || digitos.length === 13) &&
        digitos.startsWith('55')
            ? digitos.slice(2)
            : digitos;

    if (nacional.length === 10 || nacional.length === 11) {
        const ddd = nacional.slice(0, 2);
        const numero = nacional.slice(2);
        return nacional.length === 11
            ? `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`
            : `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
    }

    return neutralizarFormulaCsv(telefone);
}

export function montarCsvClientesInativos(itens: ItemClienteInativo[]): string {
    const linhas = [
        [
            'Cliente',
            'Telefone',
            'Última visita',
            'Dias sem vir',
            'Último serviço',
            'Visitas',
            'Pacote ativo com saldo',
        ],
        ...itens.map((item) => [
            neutralizarFormulaCsv(item.nome.trim() || '(sem nome)'),
            formatarTelefoneCsv(item.telefone),
            formatarDataRelatorio(item.ultimaVisita),
            item.diasSemVir,
            neutralizarFormulaCsv(item.ultimoServico ?? ''),
            item.totalVisitas,
            item.pacoteAtivoComSaldo ? 'Sim' : 'Não',
        ]),
    ];
    return serializarCsv(linhas);
}

export function nomeArquivoCsvClientesInativos(
    relatorio: Pick<RelatorioClientesInativos, 'geradoEm'>,
): string {
    const data = new Date(relatorio.geradoEm);
    const dataLocal = Number.isNaN(data.getTime())
        ? 'data-indisponivel'
        : getBrazilDateKey(data);
    return `clientes_inativos_${dataLocal}.csv`;
}

export function formatarTelefoneCliente(telefone: string): string {
    return telefone.trim() ? formatarTelefone(telefone) : 'Não informado';
}
