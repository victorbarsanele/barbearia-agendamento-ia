import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SkeletonCard } from '../components/SkeletonCard';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
    excluirServico,
    listarServicos,
    type Servico,
} from '../services/servicos.service';

function formatarPreco(valor: string | null): string {
    if (valor === null) {
        return '—';
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero)) {
        return '—';
    }

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(numero);
}

export function ServicosPage() {
    const navigate = useNavigate();

    const [servicos, setServicos] = useState<Servico[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);
    const [servicoPendenteExclusao, setServicoPendenteExclusao] =
        useState<Servico | null>(null);

    useEffect(() => {
        let ativo = true;

        const carregarServicos = async () => {
            setLoading(true);
            setErro(null);
            setSucesso(null);

            try {
                const response = await listarServicos();
                if (!ativo) {
                    return;
                }

                setServicos(response);
            } catch (error) {
                if (!ativo) {
                    return;
                }

                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível carregar os serviços.';
                setErro(message);
            } finally {
                if (ativo) {
                    setLoading(false);
                }
            }
        };

        void carregarServicos();

        return () => {
            ativo = false;
        };
    }, []);

    const servicosOrdenados = useMemo(() => {
        return [...servicos].sort((a, b) => a.nome.localeCompare(b.nome));
    }, [servicos]);

    const handleConfirmarExclusao = async () => {
        if (!servicoPendenteExclusao) {
            return;
        }

        setExcluindoId(servicoPendenteExclusao.id);
        setErro(null);
        setSucesso(null);

        try {
            await excluirServico(servicoPendenteExclusao.id);
            setServicos((current) =>
                current.filter(
                    (item) => item.id !== servicoPendenteExclusao.id,
                ),
            );
            setSucesso('Serviço excluído com sucesso.');
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Não foi possível excluir o serviço.';
            setErro(message);
            setSucesso(null);
        } finally {
            setExcluindoId(null);
            setServicoPendenteExclusao(null);
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
                        Serviços
                    </h1>
                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                        Gerencie os serviços cadastrados.
                    </p>
                </div>

                <Button
                    variant="primary"
                    className="min-h-9 px-3 text-xs"
                    onClick={() => navigate('/servicos/novo')}
                >
                    Novo serviço
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

            {!loading && !erro && servicosOrdenados.length === 0 && (
                <Card>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Nenhum serviço cadastrado ainda.
                    </p>
                </Card>
            )}

            {!loading && !erro && servicosOrdenados.length > 0 && (
                <div className="space-y-3">
                    {servicosOrdenados.map((servico) => (
                        <Card
                            key={servico.id}
                            className="flex flex-col gap-3 bg-[var(--color-surface-elevated)]"
                        >
                            <div>
                                <p className="text-base font-bold text-[var(--color-text-primary)]">
                                    {servico.nome}
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Duração: {servico.duracaoMinutos} min
                                </p>
                                <p className="text-sm text-[var(--color-text-secondary)]">
                                    Preço: {formatarPreco(servico.preco)}
                                </p>
                            </div>

                            <div className="ml-auto flex gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() =>
                                        navigate(
                                            `/servicos/editar/${servico.id}`,
                                        )
                                    }
                                    className="min-h-8 px-3 text-xs"
                                >
                                    Editar
                                </Button>
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() =>
                                        setServicoPendenteExclusao(servico)
                                    }
                                    disabled={excluindoId === servico.id}
                                    className="min-h-8 px-3 text-xs"
                                >
                                    {excluindoId === servico.id
                                        ? 'Excluindo...'
                                        : 'Excluir'}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={Boolean(servicoPendenteExclusao)}
                title="Confirmar exclusão"
                description={
                    servicoPendenteExclusao
                        ? `Deseja excluir o serviço ${servicoPendenteExclusao.nome}?`
                        : ''
                }
                confirmText="Excluir"
                loading={Boolean(excluindoId)}
                onCancel={() => {
                    if (excluindoId) {
                        return;
                    }
                    setServicoPendenteExclusao(null);
                }}
                onConfirm={() => {
                    void handleConfirmarExclusao();
                }}
            />
        </main>
    );
}
