import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ApiError } from '../services/agendamentos.service';
import {
    criarNumeroIgnorado,
    excluirNumeroIgnorado,
    listarNumerosIgnorados,
    type NumeroIgnorado,
} from '../services/numerosIgnorados.service';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconButton } from '../components/ui/IconButton';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonCard } from '../components/SkeletonCard';
import { formatarTelefone } from '../utils/formatarTelefone';

function mensagemDoErro(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function NumerosIgnoradosPage() {
    const [numeros, setNumeros] = useState<NumeroIgnorado[]>([]);
    const [telefone, setTelefone] = useState('');
    const [rotulo, setRotulo] = useState('');
    const [loading, setLoading] = useState(true);
    const [submetendo, setSubmetendo] = useState(false);
    const [excluindoId, setExcluindoId] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [confirmacaoCliente, setConfirmacaoCliente] = useState(false);
    const [numeroPendenteExclusao, setNumeroPendenteExclusao] =
        useState<NumeroIgnorado | null>(null);

    useEffect(() => {
        let ativo = true;

        void listarNumerosIgnorados()
            .then((resultado) => {
                if (ativo) setNumeros(resultado);
            })
            .catch((error: unknown) => {
                if (ativo) {
                    setErro(
                        mensagemDoErro(
                            error,
                            'Não foi possível carregar os números ignorados.',
                        ),
                    );
                }
            })
            .finally(() => {
                if (ativo) setLoading(false);
            });

        return () => {
            ativo = false;
        };
    }, []);

    const enviarNumero = async (confirmarMesmoSendoCliente = false) => {
        if (!telefone.trim() || !rotulo.trim()) return;

        setSubmetendo(true);
        setErro(null);
        try {
            const novo = await criarNumeroIgnorado({
                telefone: telefone.trim(),
                rotulo: rotulo.trim(),
                ...(confirmarMesmoSendoCliente
                    ? { confirmarMesmoSendoCliente: true }
                    : {}),
            });
            setNumeros((atuais) => [novo, ...atuais]);
            setTelefone('');
            setRotulo('');
            setConfirmacaoCliente(false);
        } catch (error) {
            if (
                !confirmarMesmoSendoCliente &&
                error instanceof ApiError &&
                error.status === 409 &&
                error.body?.code === 'NUMERO_E_CLIENTE'
            ) {
                setConfirmacaoCliente(true);
                return;
            }

            setConfirmacaoCliente(false);
            setErro(
                mensagemDoErro(
                    error,
                    'Não foi possível cadastrar o número ignorado.',
                ),
            );
        } finally {
            setSubmetendo(false);
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void enviarNumero();
    };

    const handleExcluir = async () => {
        if (!numeroPendenteExclusao) return;

        const id = numeroPendenteExclusao.id;
        setExcluindoId(id);
        setErro(null);
        try {
            await excluirNumeroIgnorado(id);
            setNumeros((atuais) => atuais.filter((numero) => numero.id !== id));
        } catch (error) {
            setErro(
                mensagemDoErro(
                    error,
                    'Não foi possível remover o número ignorado.',
                ),
            );
        } finally {
            setExcluindoId(null);
            setNumeroPendenteExclusao(null);
        }
    };

    const podeEnviar = Boolean(telefone.trim() && rotulo.trim()) && !submetendo;

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 pb-20 sm:p-6 sm:pb-24">
            <PageHeader
                variant="form"
                title="Números ignorados"
                subtitle="O assistente não responde mensagens destes números."
                backTo="/"
                backStyle="icon"
            />

            {erro && (
                <div
                    role="alert"
                    className="mb-4 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger-muted)] px-3 py-2 text-sm text-[var(--color-danger-text)]"
                >
                    {erro}
                </div>
            )}

            <Card className="mb-5 bg-[var(--color-surface-elevated)]">
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        Telefone *
                        <input
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            required
                            value={telefone}
                            onChange={(event) =>
                                setTelefone(event.target.value)
                            }
                            placeholder="+55 (11) 99999-9999"
                            className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]"
                        />
                    </label>
                    <label className="block text-sm text-[var(--color-text-secondary)]">
                        Rótulo *
                        <input
                            type="text"
                            required
                            maxLength={60}
                            value={rotulo}
                            onChange={(event) => setRotulo(event.target.value)}
                            placeholder="Ex.: Prestador"
                            className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]"
                        />
                    </label>
                    <Button type="submit" fullWidth disabled={!podeEnviar}>
                        {submetendo ? 'Salvando...' : 'Adicionar número'}
                    </Button>
                </form>
            </Card>

            {loading && (
                <div
                    className="space-y-3"
                    aria-label="Carregando números ignorados"
                >
                    <SkeletonCard count={3} variant="row" />
                </div>
            )}

            {!loading && !erro && numeros.length === 0 && (
                <Card>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Nenhum número ignorado. Cadastre números de prestadores
                        ou familiares para o assistente não responder a eles.
                    </p>
                </Card>
            )}

            {!loading && numeros.length > 0 && (
                <div className="space-y-3">
                    {numeros.map((numero) => (
                        <Card
                            key={numero.id}
                            data-testid="numero-ignorado-item"
                            className="flex items-center justify-between gap-3 bg-[var(--color-surface-elevated)]"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-semibold text-[var(--color-text-primary)]">
                                    {numero.rotulo}
                                </p>
                                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                    {formatarTelefone(numero.telefone)}
                                </p>
                            </div>
                            <IconButton
                                variant="danger"
                                ariaLabel={`Excluir número ${numero.rotulo}`}
                                disabled={excluindoId === numero.id}
                                onClick={() =>
                                    setNumeroPendenteExclusao(numero)
                                }
                            >
                                <Trash2 className="h-[18px] w-[18px]" />
                            </IconButton>
                        </Card>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={confirmacaoCliente}
                title="Este número é de um cliente"
                description="O número pertence a um cliente cadastrado. Se continuar, o assistente deixará de responder as mensagens dele no WhatsApp."
                confirmText="Ignorar mesmo assim"
                cancelText="Cancelar"
                loadingText="Salvando..."
                confirmVariant="primary"
                cancelVariant="outline"
                loading={submetendo}
                onConfirm={() => void enviarNumero(true)}
                onCancel={() => setConfirmacaoCliente(false)}
            />

            <ConfirmDialog
                open={numeroPendenteExclusao !== null}
                title="Remover número?"
                description="O assistente voltará a responder as mensagens deste número."
                confirmText="Remover"
                cancelText="Cancelar"
                loadingText="Removendo..."
                loading={excluindoId !== null}
                onConfirm={() => void handleExcluir()}
                onCancel={() => setNumeroPendenteExclusao(null)}
            />
        </main>
    );
}
