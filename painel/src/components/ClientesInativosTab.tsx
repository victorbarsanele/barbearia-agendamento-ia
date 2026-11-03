import { useEffect, useState, type FormEvent } from 'react';
import { Download, MessageCircle, Search } from 'lucide-react';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { SkeletonCard } from './SkeletonCard';
import {
    buscarClientesInativos,
    type ItemClienteInativo,
    type RelatorioClientesInativos,
} from '../services/relatorios.service';
import {
    formatarTelefoneCliente,
    montarCsvClientesInativos,
    nomeArquivoCsvClientesInativos,
    obterTelefoneWhatsApp,
    validarIntervaloDiasInativos,
} from '../utils/clientesInativos';
import { formatarDataRelatorio } from '../utils/relatorios';

interface FiltroDias {
    diasMin: number;
    diasMax: number;
    tentativa: number;
}

function mensagemDoErro(error: unknown): string {
    return error instanceof Error && error.message
        ? error.message
        : 'Não foi possível carregar o relatório.';
}

function baixarCsv(relatorio: RelatorioClientesInativos): void {
    const blob = new Blob([montarCsvClientesInativos(relatorio.itens)], {
        type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivoCsvClientesInativos(relatorio);
    link.click();
    URL.revokeObjectURL(url);
}

function nomeExibicao(item: ItemClienteInativo): string {
    return item.nome.trim() || 'Nome não informado';
}

function AcaoWhatsApp({ item }: { item: ItemClienteInativo }) {
    const telefone = obterTelefoneWhatsApp(item.telefone);
    if (!telefone) return null;

    return (
        <a
            href={`https://wa.me/${telefone}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir WhatsApp para ${nomeExibicao(item)}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
        >
            <MessageCircle aria-hidden="true" className="h-4 w-4" />
            WhatsApp
        </a>
    );
}

function IndicadorPacote({ ativo }: { ativo: boolean }) {
    if (!ativo) return null;
    return (
        <span className="inline-flex rounded-[6px] bg-[var(--color-gold-muted)] px-2 py-1 text-xs font-semibold text-[var(--color-gold)]">
            Pacote ativo com saldo
        </span>
    );
}

export function ClientesInativosTab() {
    const [diasMin, setDiasMin] = useState(30);
    const [diasMax, setDiasMax] = useState(180);
    const [filtro, setFiltro] = useState<FiltroDias>({
        diasMin: 30,
        diasMax: 180,
        tentativa: 0,
    });
    const [relatorio, setRelatorio] =
        useState<RelatorioClientesInativos | null>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    const erroValidacao = validarIntervaloDiasInativos(diasMin, diasMax);

    useEffect(() => {
        let ativo = true;

        void buscarClientesInativos(filtro.diasMin, filtro.diasMax)
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

    const consultar = (minimo: number, maximo: number) => {
        setDiasMin(minimo);
        setDiasMax(maximo);
        setRelatorio(null);
        setErro(null);
        setLoading(true);
        setFiltro((atual) => ({
            diasMin: minimo,
            diasMax: maximo,
            tentativa: atual.tentativa + 1,
        }));
    };

    const buscar = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (erroValidacao) return;
        consultar(diasMin, diasMax);
    };

    const tentarNovamente = () => {
        setRelatorio(null);
        setErro(null);
        setLoading(true);
        setFiltro((atual) => ({ ...atual, tentativa: atual.tentativa + 1 }));
    };

    const aplicarAtalho = (minimo: number) => {
        consultar(minimo, Math.max(diasMax, minimo));
    };

    return (
        <div>
            <p className="mb-5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                Lista para reativação. Considera visita qualquer agendamento já
                encerrado e não cancelado. Clientes com horário marcado ou em
                aberto, sem nenhuma visita e números ignorados não aparecem.
                Pacotes com saldo permanecem marcados.
            </p>

            <section
                aria-labelledby="filtros-clientes-inativos"
                className="mb-6"
            >
                <h2
                    id="filtros-clientes-inativos"
                    className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]"
                >
                    Dias sem vir
                </h2>
                <div className="mb-4 flex flex-wrap gap-2">
                    {[30, 45, 60].map((minimo) => (
                        <button
                            key={minimo}
                            type="button"
                            onClick={() => aplicarAtalho(minimo)}
                            className="min-h-10 rounded-[8px] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-gold)]/60 hover:text-[var(--color-gold)]"
                        >
                            A partir de {minimo} dias
                        </button>
                    ))}
                </div>
                <form
                    className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
                    onSubmit={buscar}
                    noValidate
                >
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        Mínimo de dias
                        <input
                            aria-label="Mínimo de dias sem vir"
                            type="number"
                            min={1}
                            max={365}
                            step={1}
                            value={diasMin}
                            onChange={(event) =>
                                setDiasMin(Number(event.target.value))
                            }
                            className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)]"
                        />
                    </label>
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        Máximo de dias
                        <input
                            aria-label="Máximo de dias sem vir"
                            type="number"
                            min={diasMin}
                            max={730}
                            step={1}
                            value={diasMax}
                            onChange={(event) =>
                                setDiasMax(Number(event.target.value))
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
                <div aria-label="Carregando clientes inativos" aria-busy="true">
                    <SkeletonCard count={3} variant="row" />
                </div>
            )}

            {!loading && !erro && relatorio && (
                <section aria-labelledby="resultado-clientes-inativos">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2
                                id="resultado-clientes-inativos"
                                className="text-lg font-semibold text-[var(--color-text-primary)]"
                            >
                                Clientes encontrados: {relatorio.total}
                            </h2>
                            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                Entre {relatorio.filtro.diasMin} e{' '}
                                {relatorio.filtro.diasMax} dias sem vir
                            </p>
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
                                Exportar CSV
                            </span>
                        </Button>
                    </div>

                    {relatorio.truncado && (
                        <p
                            role="status"
                            className="mb-4 rounded-[8px] border border-[var(--color-gold)]/40 bg-[var(--color-gold-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                        >
                            Exibindo os primeiros {relatorio.itens.length} de{' '}
                            {relatorio.total} clientes. Refine o período para
                            ver menos resultados.
                        </p>
                    )}

                    {relatorio.itens.length === 0 ? (
                        <Card>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Nenhum cliente encontrado neste intervalo.
                            </p>
                        </Card>
                    ) : (
                        <>
                            <div className="hidden overflow-x-auto rounded-[8px] border border-[var(--color-border)] md:block">
                                <table className="w-full border-collapse text-left text-sm">
                                    <thead className="bg-[var(--color-surface-elevated)] text-xs text-[var(--color-text-secondary)]">
                                        <tr>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                Cliente
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                Telefone
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-right font-semibold"
                                            >
                                                Dias
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                Última visita
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                Último serviço
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 text-right font-semibold"
                                            >
                                                Visitas
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                Pacote
                                            </th>
                                            <th
                                                scope="col"
                                                className="px-4 py-3 font-semibold"
                                            >
                                                Ação
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)] bg-[var(--color-surface)]">
                                        {relatorio.itens.map((item) => (
                                            <tr key={item.clienteId}>
                                                <th
                                                    scope="row"
                                                    className="max-w-[200px] break-words px-4 py-3 font-medium text-[var(--color-text-primary)]"
                                                >
                                                    {nomeExibicao(item)}
                                                </th>
                                                <td className="px-4 py-3">
                                                    {formatarTelefoneCliente(
                                                        item.telefone,
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right font-semibold">
                                                    {item.diasSemVir}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {formatarDataRelatorio(
                                                        item.ultimaVisita,
                                                    )}
                                                </td>
                                                <td className="max-w-[180px] break-words px-4 py-3">
                                                    {item.ultimoServico?.trim() ||
                                                        'Não informado'}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {item.totalVisitas}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <IndicadorPacote
                                                        ativo={
                                                            item.pacoteAtivoComSaldo
                                                        }
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <AcaoWhatsApp item={item} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <ul className="space-y-3 md:hidden">
                                {relatorio.itens.map((item) => (
                                    <li
                                        key={item.clienteId}
                                        data-testid="cliente-inativo-card"
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
                                                </div>
                                                <span className="shrink-0 text-lg font-semibold text-[var(--color-gold)]">
                                                    {item.diasSemVir} dias
                                                </span>
                                            </div>
                                            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--color-border)] pt-3 text-sm">
                                                <div>
                                                    <dt className="text-xs text-[var(--color-text-secondary)]">
                                                        Última visita
                                                    </dt>
                                                    <dd>
                                                        {formatarDataRelatorio(
                                                            item.ultimaVisita,
                                                        )}
                                                    </dd>
                                                </div>
                                                <div>
                                                    <dt className="text-xs text-[var(--color-text-secondary)]">
                                                        Último serviço
                                                    </dt>
                                                    <dd className="break-words">
                                                        {item.ultimoServico?.trim() ||
                                                            'Não informado'}
                                                    </dd>
                                                </div>
                                                <div className="col-span-2">
                                                    <IndicadorPacote
                                                        ativo={
                                                            item.pacoteAtivoComSaldo
                                                        }
                                                    />
                                                </div>
                                                <div className="col-span-2 flex items-center justify-between gap-3">
                                                    <span className="text-xs text-[var(--color-text-secondary)]">
                                                        {item.totalVisitas}{' '}
                                                        {item.totalVisitas === 1
                                                            ? 'visita'
                                                            : 'visitas'}
                                                    </span>
                                                    <AcaoWhatsApp item={item} />
                                                </div>
                                            </dl>
                                        </Card>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    <p
                        data-testid="nota-criterio-visita"
                        className="mt-4 text-xs leading-relaxed text-[var(--color-text-secondary)]"
                    >
                        Considera visita qualquer agendamento já encerrado e não
                        cancelado. Não aparecem clientes com horário marcado,
                        sem nenhuma visita ou na lista de números ignorados.
                    </p>
                </section>
            )}
        </div>
    );
}
