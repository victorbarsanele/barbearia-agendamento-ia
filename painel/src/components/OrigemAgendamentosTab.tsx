import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Download, Search } from 'lucide-react';
import {
    buscarOrigemAgendamentos,
    type OrigemRelatorioAgendamentos,
    type RelatorioOrigemAgendamentos,
} from '../services/relatorios.service';
import {
    calcularPeriodoAtalho,
    formatarDataRelatorio,
    formatarPercentualOrigem,
    montarCsvOrigemAgendamentos,
    nomeArquivoCsvOrigemAgendamentos,
    rotuloOrigemRelatorio,
    validarIntervaloRelatorio,
    type AtalhoPeriodo,
    type PeriodoRelatorio,
} from '../utils/relatorios';
import { infoOrigemAgendamento } from '../utils/origemAgendamento';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { SkeletonCard } from './SkeletonCard';

const periodoInicial = calcularPeriodoAtalho('este-mes', new Date());

const atalhos: { id: AtalhoPeriodo; label: string }[] = [
    { id: 'este-mes', label: 'Este mês' },
    { id: 'mes-passado', label: 'Mês passado' },
    { id: 'ultimos-30-dias', label: 'Últimos 30 dias' },
];

const notaOrigem =
    'Agendamentos criados no período, por canal de criação. Cada horário de lote ou pacote conta como um agendamento. Registros anteriores ao recurso aparecem como Não informado.';

function mensagemDoErro(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Não foi possível carregar o relatório.';
}

function baixarCsv(relatorio: RelatorioOrigemAgendamentos): void {
    const blob = new Blob([montarCsvOrigemAgendamentos(relatorio)], {
        type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivoCsvOrigemAgendamentos({
        de: relatorio.de,
        ate: relatorio.ate,
    });
    link.click();
    URL.revokeObjectURL(url);
}

function rotuloComIcone(origem: OrigemRelatorioAgendamentos) {
    const info =
        origem === 'WHATSAPP_IA' || origem === 'PAINEL'
            ? infoOrigemAgendamento(origem)
            : null;
    const Icon = info?.Icon;

    return (
        <span className="inline-flex items-center gap-2">
            {Icon && <Icon aria-hidden="true" className="h-4 w-4" />}
            {rotuloOrigemRelatorio(origem)}
        </span>
    );
}

function totalizarOrigens(relatorio: RelatorioOrigemAgendamentos) {
    return relatorio.origens.reduce(
        (total, origem) => ({
            criados: total.criados + origem.total,
            ativos: total.ativos + origem.ativos,
            cancelados: total.cancelados + origem.cancelados,
        }),
        { criados: 0, ativos: 0, cancelados: 0 },
    );
}

export function OrigemAgendamentosTab() {
    const [periodo, setPeriodo] = useState<PeriodoRelatorio>(periodoInicial);
    const [periodoAplicado, setPeriodoAplicado] =
        useState<PeriodoRelatorio>(periodoInicial);
    const [tentativa, setTentativa] = useState(0);
    const [relatorio, setRelatorio] =
        useState<RelatorioOrigemAgendamentos | null>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [erroPeriodo, setErroPeriodo] = useState<string | null>(null);
    const requisicaoRef = useRef<{
        chave: string;
        promessa: Promise<RelatorioOrigemAgendamentos>;
    } | null>(null);

    useEffect(() => {
        let ativo = true;
        const chave = `${periodoAplicado.de}:${periodoAplicado.ate}:${tentativa}`;
        const promessa =
            requisicaoRef.current?.chave === chave
                ? requisicaoRef.current.promessa
                : buscarOrigemAgendamentos(
                      periodoAplicado.de,
                      periodoAplicado.ate,
                  );
        requisicaoRef.current = { chave, promessa };

        void promessa
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

    const totais = relatorio ? totalizarOrigens(relatorio) : null;

    return (
        <div>
            <section
                aria-labelledby="filtros-origem-relatorio"
                className="mb-6"
            >
                <h2
                    id="filtros-origem-relatorio"
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
                            <Search aria-hidden="true" className="h-4 w-4" />
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

            {!loading && !erro && relatorio && totais && (
                <section aria-labelledby="resultado-origem-relatorio">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2
                                id="resultado-origem-relatorio"
                                className="text-lg font-semibold text-[var(--color-text-primary)]"
                            >
                                Resultado
                            </h2>
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                {formatarDataRelatorio(relatorio.de)} a{' '}
                                {formatarDataRelatorio(relatorio.ate)}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={relatorio.total === 0}
                            onClick={() => baixarCsv(relatorio)}
                        >
                            <span className="inline-flex items-center justify-center gap-2">
                                <Download
                                    aria-hidden="true"
                                    className="h-4 w-4"
                                />
                                Exportar CSV
                            </span>
                        </Button>
                    </div>

                    {relatorio.total === 0 ? (
                        <Card>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Nenhum agendamento criado no período.
                            </p>
                        </Card>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto rounded-[12px] border border-[var(--color-border)] md:block">
                                <table className="w-full border-collapse text-left text-sm">
                                    <caption className="sr-only">
                                        Agendamentos criados por origem no
                                        período
                                    </caption>
                                    <thead className="bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold">
                                                Origem
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Criados
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Ativos
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                Cancelados
                                            </th>
                                            <th className="px-4 py-3 text-right font-semibold">
                                                % do total
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)]">
                                        {relatorio.origens.map((item) => (
                                            <tr key={item.origem}>
                                                <th className="px-4 py-3 font-medium text-[var(--color-text-primary)]">
                                                    {rotuloComIcone(
                                                        item.origem,
                                                    )}
                                                </th>
                                                <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">
                                                    {item.total.toLocaleString(
                                                        'pt-BR',
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">
                                                    {item.ativos.toLocaleString(
                                                        'pt-BR',
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">
                                                    {item.cancelados.toLocaleString(
                                                        'pt-BR',
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-[var(--color-text-primary)]">
                                                    {formatarPercentualOrigem(
                                                        item.percentual,
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="border-t border-[var(--color-border)] bg-[var(--color-surface-elevated)] font-semibold text-[var(--color-text-primary)]">
                                        <tr>
                                            <th className="px-4 py-3 text-left">
                                                Total geral
                                            </th>
                                            <td className="px-4 py-3 text-right">
                                                {totais.criados.toLocaleString(
                                                    'pt-BR',
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {totais.ativos.toLocaleString(
                                                    'pt-BR',
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {totais.cancelados.toLocaleString(
                                                    'pt-BR',
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {formatarPercentualOrigem(
                                                    totais.criados > 0
                                                        ? 100
                                                        : 0,
                                                )}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>

                            <div className="space-y-3 md:hidden">
                                {relatorio.origens.map((item) => (
                                    <Card key={item.origem}>
                                        <h3 className="mb-3 font-semibold text-[var(--color-text-primary)]">
                                            {rotuloComIcone(item.origem)}
                                        </h3>
                                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    Criados
                                                </dt>
                                                <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                    {item.total.toLocaleString(
                                                        'pt-BR',
                                                    )}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    Ativos
                                                </dt>
                                                <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                    {item.ativos.toLocaleString(
                                                        'pt-BR',
                                                    )}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    Cancelados
                                                </dt>
                                                <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                    {item.cancelados.toLocaleString(
                                                        'pt-BR',
                                                    )}
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="text-xs text-[var(--color-text-secondary)]">
                                                    % do total
                                                </dt>
                                                <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                    {formatarPercentualOrigem(
                                                        item.percentual,
                                                    )}
                                                </dd>
                                            </div>
                                        </dl>
                                    </Card>
                                ))}
                                <Card className="border border-[var(--color-border)] bg-[var(--color-surface-elevated)]">
                                    <h3 className="mb-3 font-semibold text-[var(--color-text-primary)]">
                                        Total geral
                                    </h3>
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                                        <div>
                                            <dt className="text-xs text-[var(--color-text-secondary)]">
                                                Criados
                                            </dt>
                                            <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                {totais.criados.toLocaleString(
                                                    'pt-BR',
                                                )}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-[var(--color-text-secondary)]">
                                                Ativos
                                            </dt>
                                            <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                {totais.ativos.toLocaleString(
                                                    'pt-BR',
                                                )}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-[var(--color-text-secondary)]">
                                                Cancelados
                                            </dt>
                                            <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                {totais.cancelados.toLocaleString(
                                                    'pt-BR',
                                                )}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-[var(--color-text-secondary)]">
                                                % do total
                                            </dt>
                                            <dd className="mt-1 font-medium text-[var(--color-text-primary)]">
                                                {formatarPercentualOrigem(
                                                    totais.criados > 0
                                                        ? 100
                                                        : 0,
                                                )}
                                            </dd>
                                        </div>
                                    </dl>
                                </Card>
                            </div>
                        </>
                    )}

                    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        {notaOrigem}
                    </p>
                </section>
            )}
        </div>
    );
}
