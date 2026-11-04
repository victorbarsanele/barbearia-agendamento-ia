import { useEffect, useState, type FormEvent } from 'react';
import { Download, MessageCircle, Search } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { SkeletonCard } from './SkeletonCard';
import {
    buscarSaldoPacotes,
    type ItemSaldoPacote,
    type RelatorioSaldoPacotes,
} from '../services/relatorios.service';
import { formatarTelefoneCliente } from '../utils/clientesInativos';
import { obterTelefoneWhatsApp } from '../utils/contatoRelatorio';
import { formatarDataRelatorio } from '../utils/relatorios';
import {
    formatarSaldoServico,
    formatarTextoUltimaVisita,
    montarCsvSaldoPacotes,
    nomeArquivoCsvSaldoPacotes,
    validarDiasParado,
} from '../utils/saldoPacotes';

const textoAConcluir =
    'Atendimentos que já aconteceram e ainda não foram marcados como concluídos. Enquanto não concluir, o crédito não baixa.';

interface FiltroAplicado {
    diasParado: number;
    somenteParados: boolean;
    tentativa: number;
}

function mensagemDoErro(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Não foi possível carregar o relatório.';
}

function baixarCsv(relatorio: RelatorioSaldoPacotes): void {
    const blob = new Blob([montarCsvSaldoPacotes(relatorio)], {
        type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivoCsvSaldoPacotes(relatorio);
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function nomeExibicao(item: ItemSaldoPacote): string {
    return item.nome.trim() || 'Nome não informado';
}

function AcaoWhatsApp({ item }: { item: ItemSaldoPacote }) {
    const telefone = obterTelefoneWhatsApp(item.telefone);
    if (!telefone) return null;

    return (
        <a
            href={`https://wa.me/${telefone}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Chamar ${nomeExibicao(item)} no WhatsApp`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
        >
            <MessageCircle aria-hidden="true" className="h-4 w-4" />
            WhatsApp
        </a>
    );
}

function Selos({ item }: { item: ItemSaldoPacote }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {item.parado && (
                <span className="inline-flex rounded-[6px] bg-[var(--color-gold-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-gold)]">
                    Parado há {item.diasSemVir} dias
                </span>
            )}
            {item.temHorarioMarcado && (
                <span className="inline-flex rounded-[6px] bg-[var(--color-success-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-text-primary)]">
                    Horário marcado
                </span>
            )}
            {item.aConcluir > 0 && (
                <span
                    role="note"
                    title={textoAConcluir}
                    aria-label={`${item.aConcluir} a concluir. ${textoAConcluir}`}
                    className="inline-flex rounded-[6px] border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text-secondary)]"
                >
                    {item.aConcluir} a concluir
                </span>
            )}
        </div>
    );
}

function ListaSaldoServicos({ item }: { item: ItemSaldoPacote }) {
    return (
        <ul className="space-y-1">
            {item.servicos.map((servico) => (
                <li key={servico.servicoId} className="break-words">
                    {formatarSaldoServico(servico)}
                </li>
            ))}
        </ul>
    );
}

export function SaldoPacotesTab() {
    const [diasInput, setDiasInput] = useState('7');
    const [somenteParados, setSomenteParados] = useState(false);
    const [filtro, setFiltro] = useState<FiltroAplicado>({
        diasParado: 7,
        somenteParados: false,
        tentativa: 0,
    });
    const [relatorio, setRelatorio] = useState<RelatorioSaldoPacotes | null>(
        null,
    );
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const erroValidacao = validarDiasParado(diasInput);

    useEffect(() => {
        let ativo = true;

        void buscarSaldoPacotes(filtro.diasParado, filtro.somenteParados)
            .then((resultado) => {
                if (ativo) setRelatorio(resultado);
            })
            .catch((error: unknown) => {
                if (ativo) {
                    setRelatorio(null);
                    setErro(mensagemDoErro(error));
                }
            })
            .finally(() => {
                if (ativo) setLoading(false);
            });

        return () => {
            ativo = false;
        };
    }, [filtro]);

    const consultar = (diasParado: number, apenasParados: boolean) => {
        setRelatorio(null);
        setErro(null);
        setLoading(true);
        setFiltro((atual) => ({
            diasParado,
            somenteParados: apenasParados,
            tentativa: atual.tentativa + 1,
        }));
    };

    const buscar = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (erroValidacao) return;
        consultar(Number(diasInput), somenteParados);
    };

    const aplicarAtalho = (dias: number) => {
        setDiasInput(String(dias));
        consultar(dias, somenteParados);
    };

    const alternarSomenteParados = (marcado: boolean) => {
        setSomenteParados(marcado);
        const dias = erroValidacao ? filtro.diasParado : Number(diasInput);
        consultar(dias, marcado);
    };

    const tentarNovamente = () => {
        setRelatorio(null);
        setErro(null);
        setLoading(true);
        setFiltro((atual) => ({ ...atual, tentativa: atual.tentativa + 1 }));
    };

    return (
        <div>
            <p className="mb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Pacotes ativos com créditos restantes. Parado = cliente sem
                horário marcado e sem vir há pelo menos {filtro.diasParado}{' '}
                dias.
            </p>

            <section aria-labelledby="filtros-saldo-pacotes" className="mb-6">
                <h2
                    id="filtros-saldo-pacotes"
                    className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]"
                >
                    Parado há pelo menos
                </h2>
                <div className="mb-4 flex flex-wrap gap-2">
                    {[7, 15, 30].map((dias) => (
                        <button
                            key={dias}
                            type="button"
                            onClick={() => aplicarAtalho(dias)}
                            className="min-h-10 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-gold)]/60 hover:text-[var(--color-gold)]"
                        >
                            {dias} dias
                        </button>
                    ))}
                </div>

                <form
                    className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
                    onSubmit={buscar}
                    noValidate
                >
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        Dias sem vir
                        <input
                            aria-label="Dias sem vir"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={365}
                            step={1}
                            value={diasInput}
                            onChange={(event) =>
                                setDiasInput(event.target.value)
                            }
                            className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                        />
                    </label>
                    <Button type="submit" disabled={Boolean(erroValidacao)}>
                        <span className="inline-flex items-center justify-center gap-2">
                            <Search aria-hidden="true" className="h-4 w-4" />
                            Buscar
                        </span>
                    </Button>
                </form>
                {erroValidacao && (
                    <p
                        role="alert"
                        className="mt-3 text-sm text-[var(--color-danger-text)]"
                    >
                        {erroValidacao}
                    </p>
                )}

                <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--color-text-primary)]">
                    <input
                        aria-label="Mostrar só pacotes parados"
                        type="checkbox"
                        checked={somenteParados}
                        onChange={(event) =>
                            alternarSomenteParados(event.target.checked)
                        }
                        className="h-5 w-5 accent-[var(--color-gold)]"
                    />
                    Mostrar só pacotes parados
                </label>
            </section>

            {erro && (
                <div
                    role="alert"
                    className="mb-4 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger-muted)] px-3 py-2 text-sm text-[var(--color-danger-text)]"
                >
                    <p>{erro}</p>
                    <button
                        type="button"
                        onClick={tentarNovamente}
                        className="mt-2 min-h-10 font-semibold underline underline-offset-2"
                    >
                        Tentar de novo
                    </button>
                </div>
            )}

            {loading && (
                <div aria-label="Carregando saldo de pacotes" aria-busy="true">
                    <SkeletonCard count={3} variant="row" />
                </div>
            )}

            {!loading && !erro && relatorio && (
                <section aria-labelledby="resultado-saldo-pacotes">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2
                                id="resultado-saldo-pacotes"
                                className="text-lg font-semibold text-[var(--color-text-primary)]"
                            >
                                {relatorio.totalAtivos} pacotes ativos ·{' '}
                                {relatorio.totalParados} parados
                            </h2>
                            {filtro.somenteParados && (
                                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                    Mostrando {relatorio.total}
                                </p>
                            )}
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => baixarCsv(relatorio)}
                        >
                            <span className="inline-flex items-center justify-center gap-2">
                                <Download
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                                Baixar planilha
                            </span>
                        </Button>
                    </div>

                    {relatorio.truncado && (
                        <p
                            role="status"
                            className="mb-4 rounded-[8px] border border-[var(--color-gold)]/40 bg-[var(--color-gold-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                        >
                            Mostrando os 500 primeiros de {relatorio.total}.
                        </p>
                    )}

                    {relatorio.itens.length === 0 ? (
                        <Card>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                {filtro.somenteParados
                                    ? 'Nenhum pacote parado nesta faixa.'
                                    : 'Nenhum pacote ativo com saldo.'}
                            </p>
                        </Card>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto rounded-[8px] border border-[var(--color-border)] md:block">
                                <table className="w-full border-collapse text-left text-sm">
                                    <thead className="bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]">
                                        <tr>
                                            {[
                                                'Cliente',
                                                'Telefone',
                                                'Pacote',
                                                'Saldo por serviço',
                                                'Início',
                                                'Última visita / dias',
                                                'Situação',
                                                'Ação',
                                            ].map((cabecalho) => (
                                                <th
                                                    key={cabecalho}
                                                    scope="col"
                                                    className="px-3 py-3 font-semibold"
                                                >
                                                    {cabecalho}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                                        {relatorio.itens.map((item) => (
                                            <tr key={item.pacoteClienteId}>
                                                <th
                                                    scope="row"
                                                    className="max-w-[160px] break-words px-3 py-3 font-medium text-[var(--color-text-primary)]"
                                                >
                                                    {nomeExibicao(item)}
                                                </th>
                                                <td className="max-w-[140px] break-all px-3 py-3">
                                                    {formatarTelefoneCliente(
                                                        item.telefone,
                                                    )}
                                                </td>
                                                <td className="max-w-[150px] break-words px-3 py-3">
                                                    {item.pacoteNome}
                                                </td>
                                                <td className="px-3 py-3">
                                                    <ListaSaldoServicos
                                                        item={item}
                                                    />
                                                    <p className="mt-1 font-semibold">
                                                        Restam{' '}
                                                        {item.totalRestante} no
                                                        total
                                                    </p>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-3">
                                                    {formatarDataRelatorio(
                                                        item.dataInicio,
                                                    )}
                                                </td>
                                                <td className="min-w-[170px] px-3 py-3">
                                                    {formatarTextoUltimaVisita(
                                                        item,
                                                    )}
                                                </td>
                                                <td className="min-w-[150px] px-3 py-3">
                                                    <Selos item={item} />
                                                </td>
                                                <td className="px-3 py-3">
                                                    <AcaoWhatsApp item={item} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <ul
                                className="space-y-3 md:hidden"
                                data-testid="saldo-pacotes-cards"
                            >
                                {relatorio.itens.map((item) => (
                                    <li
                                        key={item.pacoteClienteId}
                                        data-testid="saldo-pacote-card"
                                    >
                                        <Card className="bg-[var(--color-surface-elevated)]">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="break-words font-semibold text-[var(--color-text-primary)]">
                                                        {nomeExibicao(item)}
                                                    </h3>
                                                    <p className="mt-1 break-all text-sm text-[var(--color-text-secondary)]">
                                                        {formatarTelefoneCliente(
                                                            item.telefone,
                                                        )}
                                                    </p>
                                                    <p className="mt-1 break-words text-sm text-[var(--color-text-primary)]">
                                                        {item.pacoteNome}
                                                    </p>
                                                </div>
                                                <AcaoWhatsApp item={item} />
                                            </div>
                                            <dl className="mt-3 space-y-3 border-t border-[var(--color-border)] pt-3 text-sm">
                                                <div>
                                                    <dt className="text-xs text-[var(--color-text-secondary)]">
                                                        Saldo por serviço
                                                    </dt>
                                                    <dd className="mt-1">
                                                        <ListaSaldoServicos
                                                            item={item}
                                                        />
                                                    </dd>
                                                </div>
                                                <div className="font-semibold">
                                                    Restam {item.totalRestante}{' '}
                                                    no total
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-[var(--color-text-secondary)]">
                                                        Início:
                                                    </dt>
                                                    <dd>
                                                        {formatarDataRelatorio(
                                                            item.dataInicio,
                                                        )}
                                                    </dd>
                                                </div>
                                                <div>
                                                    {formatarTextoUltimaVisita(
                                                        item,
                                                    )}
                                                </div>
                                                <div>
                                                    <Selos item={item} />
                                                </div>
                                            </dl>
                                        </Card>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}

                    <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        O crédito baixa quando o atendimento é marcado como
                        concluído. Pacotes não têm prazo de validade. Cliente
                        com horário marcado não é considerado parado. Números
                        ignorados não são filtrados neste relatório.
                    </p>
                </section>
            )}
        </div>
    );
}
