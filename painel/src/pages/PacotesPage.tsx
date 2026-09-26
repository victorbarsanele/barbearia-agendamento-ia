import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleX, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonCard } from '../components/SkeletonCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    excluirPacote,
    listarPacotes,
    type Pacote,
} from '../services/pacotes.service';
import { formatPrecoNumberToInputBR } from '../utils/preco';

export function PacotesPage() {
    const navigate = useNavigate();

    const [pacotes, setPacotes] = useState<Pacote[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);
    const [pacotePendenteExclusao, setPacotePendenteExclusao] =
        useState<Pacote | null>(null);

    useEffect(() => {
        let ativo = true;

        const carregarPacotes = async () => {
            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const response = await listarPacotes();
                if (!ativo) {
                    return;
                }

                setPacotes(response);
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os pacotes.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarPacotes();

        return () => {
            ativo = false;
        };
    }, []);

    const pacotesOrdenados = useMemo(() => {
        return [...pacotes].sort((a, b) => a.nome.localeCompare(b.nome));
    }, [pacotes]);

    const handleConfirmarExclusao = async () => {
        if (!pacotePendenteExclusao) {
            return;
        }

        setExcluindoId(pacotePendenteExclusao.id);
        setErro(null);
        setSucesso(null);

        try {
            await excluirPacote(pacotePendenteExclusao.id);
            setPacotes((current) =>
                current.filter((item) => item.id !== pacotePendenteExclusao.id),
            );
            setSucesso('Pacote excluído com sucesso.');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível excluir o pacote.';
            setErro(message);
            setSucesso(null);
        } finally {
            setExcluindoId(null);
            setPacotePendenteExclusao(null);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 pb-20 sm:p-6 sm:pb-24">
            <header className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h1
                        className="text-[34px] font-bold leading-none text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Pacotes
                    </h1>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        Gerencie os pacotes de serviços cadastrados.
                    </p>
                </div>

                <Button
                    variant="primary"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => navigate('/pacotes/novo')}
                >
                    Novo pacote
                </Button>
            </header>

            {loading && (
                <SkeletonCard count={3} heightClassName="min-h-[132px]" />
            )}

            {erro && (
                <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]">
                    {erro}
                </div>
            )}

            {sucesso && (
                <div className="mb-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-4 text-sm text-[var(--color-success)]">
                    {sucesso}
                </div>
            )}

            {!loading && !erro && pacotesOrdenados.length === 0 && (
                <Card>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Nenhum pacote cadastrado ainda.
                    </p>
                </Card>
            )}

            {!loading && !erro && pacotesOrdenados.length > 0 && (
                <div className="space-y-3">
                    {pacotesOrdenados.map((pacote) => (
                        <Card
                            key={pacote.id}
                            className="flex flex-col gap-3 border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                        >
                            <div className="space-y-2">
                                <div className="relative">
                                    <p className="min-w-0 pr-14 text-xl font-bold leading-tight text-[var(--color-text-primary)]">
                                        {pacote.nome}
                                    </p>
                                    <span className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-gold-muted)] text-[var(--color-gold)]">
                                        <Package size={23} aria-hidden="true" />
                                    </span>
                                </div>

                                <div className="flex items-center gap-3 text-base">
                                    <span className="text-[var(--color-text-secondary)]">
                                        {pacote.duracaoDias} dias
                                    </span>
                                    <span
                                        className="h-1 w-1 rounded-full bg-[var(--color-text-secondary)]"
                                        aria-hidden="true"
                                    />
                                    <span className="text-xl font-bold text-[var(--color-gold)]">
                                        R${' '}
                                        {formatPrecoNumberToInputBR(
                                            pacote.preco,
                                        )}
                                    </span>
                                </div>

                                <div
                                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${pacote.liberadoParaGemini ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : 'bg-[var(--color-border)]/55 text-[var(--color-text-secondary)]'}`}
                                >
                                    {pacote.liberadoParaGemini ? (
                                        <CheckCircle2
                                            size={20}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        <CircleX size={20} aria-hidden="true" />
                                    )}
                                    <span>
                                        {pacote.liberadoParaGemini
                                            ? 'Liberado para sugestão do Gemini'
                                            : 'Não liberado para sugestão do Gemini'}
                                    </span>
                                </div>

                                <div>
                                    <p className="text-sm font-bold uppercase text-[var(--color-text-secondary)]">
                                        Consumo por serviço
                                    </p>
                                    <ul className="mt-2 flex flex-wrap gap-2">
                                        {pacote.servicos.map((item) => (
                                            <li
                                                key={item.servicoId}
                                                className="rounded-full border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-secondary)]"
                                            >
                                                {item.servico.nome}{' '}
                                                <strong className="font-bold text-[var(--color-text-primary)]">
                                                    {item.quantidadeTotal} usos
                                                </strong>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            <div
                                className="border-t border-[var(--color-border)]"
                                aria-hidden="true"
                            />

                            <div className="ml-auto flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        navigate(`/pacotes/editar/${pacote.id}`)
                                    }
                                    className="min-h-8 px-3 text-xs"
                                >
                                    Editar
                                </Button>
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() =>
                                        setPacotePendenteExclusao(pacote)
                                    }
                                    disabled={excluindoId === pacote.id}
                                    className="min-h-8 px-3 text-xs"
                                >
                                    {excluindoId === pacote.id
                                        ? 'Excluindo...'
                                        : 'Excluir'}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={Boolean(pacotePendenteExclusao)}
                title="Confirmar exclusão"
                description={
                    pacotePendenteExclusao
                        ? `Deseja excluir o pacote ${pacotePendenteExclusao.nome}?`
                        : ''
                }
                confirmText="Excluir"
                loading={Boolean(excluindoId)}
                onCancel={() => {
                    if (excluindoId) {
                        return;
                    }
                    setPacotePendenteExclusao(null);
                }}
                onConfirm={() => {
                    void handleConfirmarExclusao();
                }}
            />
        </main>
    );
}
