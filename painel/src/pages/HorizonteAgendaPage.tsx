import { useEffect, useState } from 'react';
import { DateKeyPicker } from '../components/DateKeyPicker';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { SkeletonCard } from '../components/SkeletonCard';
import {
    buscarConfiguracaoAgendamento,
    salvarHorizonteAgenda,
    type ConfiguracaoAgendamento,
    type SalvarHorizonteAgendaPayload,
} from '../services/configuracaoAgendamento.service';
import { formatBrazilDateKey, getBrazilDateKey } from '../utils/dateTime';
import {
    calcularHorizontePreview,
    validarHorizonteDias,
    validarLimiteAte,
} from '../utils/horizonteAgenda';

interface ValoresFormulario {
    horizonteDias: string;
    limiteAte: string;
}

function valoresDaConfiguracao(
    configuracao: ConfiguracaoAgendamento,
): ValoresFormulario {
    return {
        horizonteDias: configuracao.horizonteDias?.toString() ?? '',
        limiteAte: configuracao.limiteAte ?? '',
    };
}

function mensagemDoErro(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function HorizonteAgendaPage() {
    const [configuracaoServidor, setConfiguracaoServidor] =
        useState<ConfiguracaoAgendamento | null>(null);
    const [valores, setValores] = useState<ValoresFormulario>({
        horizonteDias: '',
        limiteAte: '',
    });
    const [snapshot, setSnapshot] = useState<ValoresFormulario | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [tentativaCarga, setTentativaCarga] = useState(0);
    const [submetendo, setSubmetendo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);
    const [confirmacaoPadrao, setConfirmacaoPadrao] = useState(false);

    const hojeChave = getBrazilDateKey(new Date());
    const dataMaxima = calcularHorizontePreview(hojeChave, 180, null).fim;
    const erroJanela = validarHorizonteDias(valores.horizonteDias);
    const erroTeto = validarLimiteAte(valores.limiteAte, hojeChave);
    const formularioValido = erroJanela === null && erroTeto === null;
    const horizonteNumerico =
        valores.horizonteDias === '' || erroJanela
            ? null
            : Number(valores.horizonteDias);
    const preview = formularioValido
        ? calcularHorizontePreview(
              hojeChave,
              horizonteNumerico,
              valores.limiteAte || null,
          )
        : null;
    const payload: SalvarHorizonteAgendaPayload = {
        horizonteDias: horizonteNumerico,
        limiteAte: valores.limiteAte || null,
    };
    const dirty =
        snapshot !== null &&
        JSON.stringify(valores) !== JSON.stringify(snapshot);
    const podeRestaurarPadrao =
        valores.horizonteDias !== '' ||
        valores.limiteAte !== '' ||
        snapshot?.horizonteDias !== '' ||
        snapshot?.limiteAte !== '';

    useEffect(() => {
        let ativo = true;
        setCarregando(true);
        setErro(null);

        void buscarConfiguracaoAgendamento()
            .then((configuracao) => {
                if (!ativo) return;
                const novosValores = valoresDaConfiguracao(configuracao);
                setConfiguracaoServidor(configuracao);
                setValores(novosValores);
                setSnapshot(novosValores);
                setSucesso(null);
            })
            .catch((error: unknown) => {
                if (ativo) {
                    setErro(
                        mensagemDoErro(
                            error,
                            'Não foi possível carregar a configuração do horizonte.',
                        ),
                    );
                }
            })
            .finally(() => {
                if (ativo) setCarregando(false);
            });

        return () => {
            ativo = false;
        };
    }, [tentativaCarga]);

    const aplicarConfiguracao = (configuracao: ConfiguracaoAgendamento) => {
        const novosValores = valoresDaConfiguracao(configuracao);
        setConfiguracaoServidor(configuracao);
        setValores(novosValores);
        setSnapshot(novosValores);
    };

    const enviar = async (dados: SalvarHorizonteAgendaPayload) => {
        setSubmetendo(true);
        setErro(null);
        setSucesso(null);
        try {
            const configuracao = await salvarHorizonteAgenda(dados);
            aplicarConfiguracao(configuracao);
            setSucesso('Horizonte da agenda atualizado.');
            setConfirmacaoPadrao(false);
        } catch (error) {
            setErro(
                mensagemDoErro(
                    error,
                    'Não foi possível salvar o horizonte da agenda.',
                ),
            );
        } finally {
            setSubmetendo(false);
        }
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!formularioValido || !dirty) return;
        void enviar(payload);
    };

    const handleVoltarAoPadrao = () => {
        void enviar({ horizonteDias: null, limiteAte: null });
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[600px] bg-[var(--color-bg)] p-4 pb-24 sm:p-6">
            <PageHeader
                variant="form"
                title="Horizonte da agenda"
                subtitle="Defina até quando o atendimento automático pode agendar."
                backTo="/"
                backStyle="icon"
            />

            <p className="mb-5 text-sm text-[var(--color-text-secondary)]">
                O horizonte vale para o atendimento automático no WhatsApp.
                Agendamentos feitos pelo painel não são limitados.
            </p>

            {erro && (
                <div
                    role="alert"
                    className="mb-4 rounded-[8px] border border-[var(--color-danger)]/40 bg-[var(--color-danger-muted)] px-3 py-2 text-sm text-[var(--color-danger-text)]"
                >
                    {erro}
                </div>
            )}
            {sucesso && (
                <div
                    role="status"
                    className="mb-4 rounded-[8px] border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 px-3 py-2 text-sm text-[var(--color-success)]"
                >
                    {sucesso}
                </div>
            )}

            {carregando ? (
                <SkeletonCard count={2} />
            ) : erro && !configuracaoServidor ? (
                <Card>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                        Não foi possível carregar os campos do horizonte.
                    </p>
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-4"
                        onClick={() =>
                            setTentativaCarga((tentativa) => tentativa + 1)
                        }
                    >
                        Tentar novamente
                    </Button>
                </Card>
            ) : (
                <>
                    <Card className="bg-[var(--color-surface-elevated)]">
                        <form
                            className="space-y-5"
                            onSubmit={(event) => void handleSubmit(event)}
                        >
                            <label
                                htmlFor="horizonte-dias"
                                className="block text-sm font-medium text-[var(--color-text-secondary)]"
                            >
                                Janela (dias à frente)
                                <input
                                    id="horizonte-dias"
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={180}
                                    step={1}
                                    value={valores.horizonteDias}
                                    onChange={(event) => {
                                        setValores((atuais) => ({
                                            ...atuais,
                                            horizonteDias: event.target.value,
                                        }));
                                        setErro(null);
                                        setSucesso(null);
                                    }}
                                    placeholder="Padrão: 20 dias"
                                    aria-invalid={Boolean(erroJanela)}
                                    aria-describedby="horizonte-ajuda horizonte-erro"
                                    className="mt-2 min-h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]"
                                />
                                <span
                                    id="horizonte-ajuda"
                                    className="mt-1 block text-xs text-[var(--color-text-secondary)]"
                                >
                                    Vazio usa o padrão de 20 dias. Aceita de 1 a
                                    180.
                                </span>
                                {erroJanela && (
                                    <span
                                        id="horizonte-erro"
                                        className="mt-1 block text-xs text-[var(--color-danger-text)]"
                                    >
                                        {erroJanela}
                                    </span>
                                )}
                            </label>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
                                    Teto (data máxima)
                                </label>
                                <div className="flex items-center gap-2">
                                    <div className="min-w-0 flex-1">
                                        <DateKeyPicker
                                            value={valores.limiteAte}
                                            onChange={(limiteAte) => {
                                                setValores((atuais) => ({
                                                    ...atuais,
                                                    limiteAte,
                                                }));
                                                setErro(null);
                                                setSucesso(null);
                                            }}
                                            minDateKey={hojeChave}
                                            maxDateKey={dataMaxima}
                                            placeholder="Sem teto"
                                        />
                                    </div>
                                    {valores.limiteAte && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            className="shrink-0 px-2"
                                            onClick={() => {
                                                setValores((atuais) => ({
                                                    ...atuais,
                                                    limiteAte: '',
                                                }));
                                                setErro(null);
                                                setSucesso(null);
                                            }}
                                        >
                                            Limpar
                                        </Button>
                                    )}
                                </div>
                                {erroTeto && (
                                    <p
                                        role="alert"
                                        className="mt-1 text-xs text-[var(--color-danger-text)]"
                                    >
                                        {erroTeto}
                                    </p>
                                )}
                            </div>

                            <div
                                data-testid="horizonte-preview"
                                aria-live="polite"
                                className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-inset)] p-3"
                            >
                                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                    Horizonte efetivo previsto:{' '}
                                    {preview
                                        ? formatBrazilDateKey(preview.fim)
                                        : 'corrija os campos para calcular'}
                                </p>
                                {preview?.tetoAtivo &&
                                    !preview.tetoRestringe && (
                                        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                                            O teto só encurta a janela. Com esta
                                            configuração, a janela vai até{' '}
                                            {formatBrazilDateKey(preview.fim)};
                                            o teto não a estende.
                                        </p>
                                    )}
                                {configuracaoServidor && (
                                    <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                                        Horizonte efetivo informado pelo
                                        servidor:{' '}
                                        {formatBrazilDateKey(
                                            configuracaoServidor.horizonteEfetivo,
                                        )}
                                    </p>
                                )}
                            </div>

                            {configuracaoServidor &&
                                configuracaoServidor.limiteAte !== null &&
                                !configuracaoServidor.limiteAtivo && (
                                    <p
                                        role="status"
                                        className="rounded-[8px] border border-[var(--color-gold)]/40 bg-[var(--color-gold-muted)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                                    >
                                        O teto salvo de{' '}
                                        {formatBrazilDateKey(
                                            configuracaoServidor.limiteAte,
                                        )}{' '}
                                        venceu e foi ignorado.
                                    </p>
                                )}

                            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        submetendo ||
                                        carregando ||
                                        !podeRestaurarPadrao
                                    }
                                    onClick={() => setConfirmacaoPadrao(true)}
                                >
                                    Voltar ao padrão (20 dias)
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        submetendo ||
                                        carregando ||
                                        !dirty ||
                                        !formularioValido
                                    }
                                >
                                    {submetendo ? 'Salvando...' : 'Salvar'}
                                </Button>
                            </div>
                        </form>
                    </Card>

                    <ConfirmDialog
                        open={confirmacaoPadrao}
                        title="Voltar ao padrão?"
                        description="A janela voltará ao padrão de 20 dias e o teto será removido."
                        confirmText="Voltar ao padrão"
                        cancelText="Cancelar"
                        loadingText="Salvando..."
                        confirmVariant="primary"
                        cancelVariant="outline"
                        loading={submetendo}
                        onConfirm={handleVoltarAoPadrao}
                        onCancel={() => setConfirmacaoPadrao(false)}
                    />
                </>
            )}
        </main>
    );
}
