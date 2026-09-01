import { useEffect, useMemo, useState } from 'react';
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
                            className="flex flex-col gap-3 bg-[var(--color-surface-elevated)]"
                        >
                            <div>
                                <p className="text-base font-bold text-[var(--color-text-primary)]">
                                    {pacote.nome}
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Quantidade: {pacote.quantidade}
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Duração: {pacote.duracaoDias} dias
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Serviços:{' '}
                                    {pacote.servicos
                                        .map((item) => item.servico.nome)
                                        .join(', ') || '—'}
                                </p>
                            </div>

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
