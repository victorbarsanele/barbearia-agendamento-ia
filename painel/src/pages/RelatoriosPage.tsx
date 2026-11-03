import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Search } from 'lucide-react';
import { ClientesInativosTab } from '../components/ClientesInativosTab';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonCard } from '../components/SkeletonCard';
import {
    buscarAtendimentos,
    type RelatorioAtendimentos,
} from '../services/relatorios.service';
import {
    calcularPeriodoAtalho,
    formatarDataRelatorio,
    formatarValorEstimado,
    montarCsvAtendimentos,
    nomeArquivoCsvAtendimentos,
    validarIntervaloRelatorio,
    type AtalhoPeriodo,
    type PeriodoRelatorio,
} from '../utils/relatorios';

const periodoInicial = calcularPeriodoAtalho('este-mes', new Date());

const atalhos: { id: AtalhoPeriodo; label: string }[] = [
    { id: 'este-mes', label: 'Este mês' },
    { id: 'mes-passado', label: 'Mês passado' },
    { id: 'ultimos-30-dias', label: 'Últimos 30 dias' },
];

function mensagemDoErro(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Não foi possível carregar o relatório.';
}

function baixarCsv(relatorio: RelatorioAtendimentos): void {
    const blob = new Blob([montarCsvAtendimentos(relatorio)], {
        type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivoCsvAtendimentos(relatorio.periodo);
    link.click();
    URL.revokeObjectURL(url);
}

function AtendimentosTab() {
    const [periodo, setPeriodo] = useState<PeriodoRelatorio>(periodoInicial);
    const [periodoAplicado, setPeriodoAplicado] =
        useState<PeriodoRelatorio>(periodoInicial);
    const [tentativa, setTentativa] = useState(0);
    const [relatorio, setRelatorio] = useState<RelatorioAtendimentos | null>(
        null,
    );
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [erroPeriodo, setErroPeriodo] = useState<string | null>(null);

    useEffect(() => {
        let ativo = true;

        void buscarAtendimentos(periodoAplicado.de, periodoAplicado.ate)
            .then((resultado) => {
                if (ativo) setRelatorio(resultado);
            })
            .catch((error: unknown) => {
                if (ativo) setErro(mensagemDoErro(error));
            })
            .finally(() => {
                if (ativo) setLoading(false);
            });

        return () => {
            ativo = false;
        };
    }, [periodoAplicado, tentativa]);

    const atualizarPeriodo = (campo: keyof PeriodoRelatorio, valor: string) => {
        setPeriodo((atual) => ({ ...atual, [campo]: valor }));
        setErroPeriodo(null);
    };

    const aplicarAtalho = (atalho: AtalhoPeriodo) => {
        setPeriodo(calcularPeriodoAtalho(atalho, new Date()));
        setErroPeriodo(null);
    };

    const buscar = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const erroValidacao = validarIntervaloRelatorio(
            periodo.de,
            periodo.ate,
        );
        if (erroValidacao) {
            setErroPeriodo(erroValidacao);
            return;
        }

        setErroPeriodo(null);
        setLoading(true);
        setErro(null);
        setRelatorio(null);
        setPeriodoAplicado({ ...periodo });
        setTentativa((atual) => atual + 1);
    };

    const tentarNovamente = () => {
        setLoading(true);
        setErro(null);
        setRelatorio(null);
        setTentativa((atual) => atual + 1);
    };

    const total = relatorio?.total;
    const temServicoSemPreco =
        relatorio?.itens.some((item) => item.semPreco > 0) ?? false;

    return (
        <div>
            <section aria-labelledby="filtros-relatorio" className="mb-6">
                <h2
                    id="filtros-relatorio"
                    className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]"
                >
                    Período
                </h2>
                <div className="mb-4 flex flex-wrap gap-2">
                    {atalhos.map((atalho) => (
                        <button
                            key={atalho.id}
                            type="button"
                            onClick={() => aplicarAtalho(atalho.id)}
                            className="min-h-10 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-gold)]/60 hover:text-[var(--color-gold)]"
                        >
                            {atalho.label}
                        </button>
                    ))}
                </div>

                <form
                    className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
                    onSubmit={buscar}
                    noValidate
                >
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        De
                        <input
                            aria-label="Data inicial"
                            type="date"
                            required
                            value={periodo.de}
                            onChange={(event) =>
                                atualizarPeriodo('de', event.target.value)
                            }
                            className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] [color-scheme:dark]"
                        />
                    </label>
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        Até
                        <input
                            aria-label="Data final"
                            type="date"
                            required
                            value={periodo.ate}
                            onChange={(event) =>
                                atualizarPeriodo('ate', event.target.value)
                            }
                            className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] [color-scheme:dark]"
                        />
                    </label>
                    <Button type="submit" className="w-full sm:w-auto">
                        <span className="inline-flex items-center justify-center gap-2">
                            <Search className="h-4 w-4" />
                            Buscar
                        </span>
                    </Button>
                </form>
                {erroPeriodo && (
                    <p
                        role="alert"
                        className="mt-3 text-sm text-[var(--color-danger-text)]"
                    >
                        {erroPeriodo}
                    </p>
                )}
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
                        Tentar novamente
                    </button>
                </div>
            )}

            {loading && (
                <div aria-label="Carregando relatório" aria-busy="true">
                    <SkeletonCard count={3} variant="row" />
                </div>
            )}

            {!loading && !erro && relatorio && (
                <section aria-labelledby="resultado-relatorio">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2
                                id="resultado-relatorio"
                                className="text-lg font-semibold text-[var(--color-text-primary)]"
                            >
                                Resultado
                            </h2>
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                {formatarDataRelatorio(relatorio.periodo.de)} a{' '}
                                {formatarDataRelatorio(relatorio.periodo.ate)}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => baixarCsv(relatorio)}
                        >
                            <span className="inline-flex items-center justify-center gap-2">
                                <Download className="h-4 w-4" />
                                Exportar CSV
                            </span>
                        </Button>
                    </div>

                    <div
                        className={`mb-5 grid grid-cols-1 gap-3 ${total?.semPreco ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
                    >
                        <Card className="bg-[var(--color-surface-elevated)]">
                            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                                Atendimentos
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--color-gold)]">
                                {total?.quantidade ?? 0}
                            </p>
                        </Card>
                        <Card className="bg-[var(--color-surface-elevated)]">
                            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                                Valor estimado
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
                                {formatarValorEstimado(
                                    total?.valorEstimado ?? null,
                                )}
                            </p>
                        </Card>
                        {total && total.semPreco > 0 && (
                            <Card className="bg-[var(--color-surface-elevated)]">
                                <p className="text-xs font-medium text-[var(--color-text-secondary)]">
                                    Sem preço registrado
                                </p>
                                <p className="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
                                    {total.semPreco}
                                </p>
                            </Card>
                        )}
                    </div>

                    {relatorio.itens.length === 0 ? (
                        <Card>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Nenhum atendimento encontrado neste período.
                            </p>
                        </Card>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto rounded-[12px] border border-[var(--color-border)] md:block">
                                <table className="w-full border-collapse text-left text-sm">
                                    <thead className="bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">
                                                Serviço
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Atendimentos
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Avulso
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Pacote
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Valor estimado
                                            </th>
                                            {temServicoSemPreco && (
                                                <th className="px-4 py-3 text-right font-semibold">
                                                    Sem preço
                                                </th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                                        {relatorio.itens.map((item) => (
                                            <tr key={item.servicoId}>
                                                <th
                                                    scope="row"
                                                    className="max-w-[260px] break-words px-4 py-3 font-medium text-[var(--color-text-primary)]"
                                                >
                                                    {item.nome}
                                                </th>
                                                <td className="px-4 py-3 text-right">
                                                    {item.quantidade}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {item.quantidadeAvulso}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {item.quantidadePacote}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {formatarValorEstimado(
                                                        item.valorEstimado,
                                                    )}
                                                </td>
                                                {temServicoSemPreco && (
                                                    <td className="px-4 py-3 text-right">
                                                        {item.semPreco > 0
                                                            ? item.semPreco
                                                            : ''}
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-3 md:hidden">
                                {relatorio.itens.map((item) => (
                                    <Card
                                        key={item.servicoId}
                                        data-testid="relatorio-servico-card"
                                        className="bg-[var(--color-surface-elevated)]"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="min-w-0 break-words font-semibold text-[var(--color-text-primary)]">
                                                {item.nome}
                                            </h3>
                                            <span className="shrink-0 text-lg font-semibold text-[var(--color-gold)]">
                                                {item.quantidade}
                                            </span>
                                        </div>
                                        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--color-border)] pt-3 text-sm">
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    Avulso
                                                </dt>
                                                <dd>{item.quantidadeAvulso}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    Pacote
                                                </dt>
                                                <dd>{item.quantidadePacote}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    Valor estimado
                                                </dt>
                                                <dd>
                                                    {formatarValorEstimado(
                                                        item.valorEstimado,
                                                    )}
                                                </dd>
                                            </div>
                                            {item.semPreco > 0 && (
                                                <div>
                                                    <dt className="text-xs text-[var(--color-text-secondary)]">
                                                        Sem preço
                                                    </dt>
                                                    <dd>{item.semPreco}</dd>
                                                </div>
                                            )}
                                        </dl>
                                    </Card>
                                ))}
                            </div>
                        </>
                    )}
                    <p className="mt-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                        Valor estimado a preço de tabela, não é faturamento.
                        Atendimentos de pacote contam depois de marcados como
                        concluídos.
                    </p>
                </section>
            )}
        </div>
    );
}

type AbaRelatorio = 'servicos' | 'inativos';

const abas: { id: AbaRelatorio; label: string }[] = [
    { id: 'servicos', label: 'Atendimentos por serviço' },
    { id: 'inativos', label: 'Clientes inativos' },
];

export function RelatoriosPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const botoesAbas = useRef<Array<HTMLButtonElement | null>>([]);
    const abaAtiva: AbaRelatorio =
        searchParams.get('relatorio') === 'inativos' ? 'inativos' : 'servicos';

    const selecionarAba = (aba: AbaRelatorio, focar = false) => {
        const parametros = new URLSearchParams(searchParams);
        parametros.set('relatorio', aba);
        setSearchParams(parametros);
        if (focar) {
            const indice = abas.findIndex((item) => item.id === aba);
            requestAnimationFrame(() => botoesAbas.current[indice]?.focus());
        }
    };

    const navegarAbas = (
        event: React.KeyboardEvent<HTMLButtonElement>,
        indiceAtual: number,
    ) => {
        let proximoIndice: number | null = null;
        if (event.key === 'ArrowRight') {
            proximoIndice = (indiceAtual + 1) % abas.length;
        } else if (event.key === 'ArrowLeft') {
            proximoIndice = (indiceAtual - 1 + abas.length) % abas.length;
        } else if (event.key === 'Home') {
            proximoIndice = 0;
        } else if (event.key === 'End') {
            proximoIndice = abas.length - 1;
        }
        if (proximoIndice !== null) {
            event.preventDefault();
            selecionarAba(abas[proximoIndice].id, true);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[900px] bg-[var(--color-bg)] p-4 pb-24 sm:p-6 sm:pb-28">
            <PageHeader
                variant="list"
                title="Relatórios"
                subtitle={
                    abaAtiva === 'inativos'
                        ? 'Clientes inativos'
                        : 'Atendimentos por serviço'
                }
            />
            <div
                role="tablist"
                aria-label="Relatórios"
                className="mb-6 flex overflow-x-auto border-b border-[var(--color-border)]"
            >
                {abas.map((aba, indice) => (
                    <button
                        key={aba.id}
                        ref={(element) => {
                            botoesAbas.current[indice] = element;
                        }}
                        id={`relatorio-tab-${aba.id}`}
                        type="button"
                        role="tab"
                        aria-selected={abaAtiva === aba.id}
                        aria-controls="relatorio-tabpanel"
                        tabIndex={abaAtiva === aba.id ? 0 : -1}
                        onClick={() => selecionarAba(aba.id)}
                        onKeyDown={(event) => navegarAbas(event, indice)}
                        className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition sm:px-4 ${abaAtiva === aba.id ? 'border-[var(--color-gold)] text-[var(--color-gold)]' : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                    >
                        {aba.label}
                    </button>
                ))}
            </div>
            <div
                id="relatorio-tabpanel"
                role="tabpanel"
                aria-labelledby={`relatorio-tab-${abaAtiva}`}
                tabIndex={0}
            >
                {abaAtiva === 'inativos' ? (
                    <ClientesInativosTab />
                ) : (
                    <AtendimentosTab />
                )}
            </div>
        </main>
    );
}
