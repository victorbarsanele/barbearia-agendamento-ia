import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { TimeTextInput } from '../components/TimeTextInput';
import {
    atualizarHorariosFuncionamento,
    listarHorariosFuncionamento,
    type HorarioFuncionamento,
    type HorarioFuncionamentoPayload,
} from '../services/horariosFuncionamento.service';

const nomesDias = [
    'Domingo',
    'Segunda-feira',
    'Terça-feira',
    'Quarta-feira',
    'Quinta-feira',
    'Sexta-feira',
    'Sábado',
];

function criarPayloadPadrao(
    diaSemana: number,
): HorarioFuncionamentoPayload | null {
    if (diaSemana === 0) {
        return null;
    }

    return {
        diaSemana,
        horaAberturaMinutos: 9 * 60,
        horaFechamentoMinutos: 20 * 60,
        limiteExtensaoMinutos: null,
        ultimoInicioExtensaoMinutos: null,
    };
}

function paraPayload(
    configuracao: HorarioFuncionamento,
): HorarioFuncionamentoPayload {
    return {
        diaSemana: configuracao.diaSemana,
        horaAberturaMinutos: configuracao.horaAberturaMinutos,
        horaFechamentoMinutos: configuracao.horaFechamentoMinutos,
        limiteExtensaoMinutos: configuracao.limiteExtensaoMinutos,
        ultimoInicioExtensaoMinutos: configuracao.ultimoInicioExtensaoMinutos,
    };
}

export function HorariosFuncionamentoPage() {
    const navigate = useNavigate();
    const [configuracoes, setConfiguracoes] = useState<
        Array<HorarioFuncionamentoPayload | null>
    >([]);
    const [loading, setLoading] = useState(true);
    const [submetendo, setSubmetendo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [sucesso, setSucesso] = useState<string | null>(null);

    useEffect(() => {
        let ativo = true;

        void listarHorariosFuncionamento()
            .then((resultado) => {
                if (ativo) {
                    setConfiguracoes(
                        resultado.map((item, diaSemana) =>
                            item
                                ? paraPayload(item)
                                : criarPayloadPadrao(diaSemana),
                        ),
                    );
                }
            })
            .catch((error) => {
                if (ativo) {
                    setErro(
                        error instanceof Error
                            ? error.message
                            : 'Não foi possível carregar os horários.',
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

    const atualizarCampo = (
        diaSemana: number,
        campo: keyof HorarioFuncionamentoPayload,
        valor: number | null,
    ) => {
        setConfiguracoes((atual) =>
            atual.map((item, indice) =>
                indice === diaSemana && item
                    ? { ...item, [campo]: valor }
                    : item,
            ),
        );
    };

    const alternarExtensao = (diaSemana: number, habilitada: boolean) => {
        const configuracao = configuracoes[diaSemana];
        if (!configuracao) return;

        atualizarCampo(
            diaSemana,
            'limiteExtensaoMinutos',
            habilitada ? configuracao.horaFechamentoMinutos + 30 : null,
        );
        atualizarCampo(
            diaSemana,
            'ultimoInicioExtensaoMinutos',
            habilitada ? configuracao.horaFechamentoMinutos : null,
        );
    };

    const validar = (): string | null => {
        for (const configuracao of configuracoes) {
            if (!configuracao) continue;

            if (
                configuracao.horaAberturaMinutos >=
                configuracao.horaFechamentoMinutos
            ) {
                return `Abertura deve ser antes do fechamento em ${nomesDias[configuracao.diaSemana]}.`;
            }

            if (
                configuracao.limiteExtensaoMinutos !== null &&
                (configuracao.limiteExtensaoMinutos <=
                    configuracao.horaFechamentoMinutos ||
                    configuracao.ultimoInicioExtensaoMinutos === null ||
                    configuracao.ultimoInicioExtensaoMinutos < 0)
            ) {
                return `Extensão inválida em ${nomesDias[configuracao.diaSemana]}.`;
            }
        }

        return null;
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const mensagemErro = validar();
        if (mensagemErro) {
            setErro(mensagemErro);
            setSucesso(null);
            return;
        }

        setSubmetendo(true);
        setErro(null);
        setSucesso(null);
        try {
            const resultado =
                await atualizarHorariosFuncionamento(configuracoes);
            setConfiguracoes(
                resultado.map((item, diaSemana) =>
                    item ? paraPayload(item) : criarPayloadPadrao(diaSemana),
                ),
            );
            setSucesso('Horários atualizados com sucesso.');
        } catch (error) {
            setErro(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível salvar os horários.',
            );
        } finally {
            setSubmetendo(false);
        }
    };

    return (
        <main className="mx-auto min-h-screen w-full max-w-[700px] bg-[var(--color-bg)] p-4 pb-24 sm:p-6">
            <header className="mb-6 flex items-center gap-3">
                <Button
                    variant="ghost"
                    aria-label="Voltar"
                    onClick={() => navigate('/')}
                >
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1
                        className="text-3xl font-bold text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Horário de funcionamento
                    </h1>
                    <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        Configure abertura, fechamento e extensão por dia.
                    </p>
                </div>
            </header>

            {loading && <Card>Carregando horários...</Card>}
            {erro && (
                <div className="mb-4 rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
                    {erro}
                </div>
            )}
            {sucesso && (
                <div className="mb-4 rounded-md border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
                    {sucesso}
                </div>
            )}

            {!loading && configuracoes.length === 7 && (
                <form
                    className="space-y-3"
                    onSubmit={(event) => void handleSubmit(event)}
                >
                    {configuracoes.map((configuracao, diaSemana) => (
                        <Card
                            key={diaSemana}
                            className="bg-[var(--color-surface-elevated)]"
                        >
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h2 className="text-base font-bold text-[var(--color-text-primary)]">
                                    {nomesDias[diaSemana]}
                                </h2>
                                {!configuracao && (
                                    <span className="text-xs text-[var(--color-text-secondary)]">
                                        Sem funcionamento configurado
                                    </span>
                                )}
                            </div>

                            {configuracao && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(
                                            [
                                                'horaAberturaMinutos',
                                                'horaFechamentoMinutos',
                                            ] as const
                                        ).map((campo) => (
                                            <label
                                                key={campo}
                                                className="text-sm text-[var(--color-text-secondary)]"
                                            >
                                                {campo === 'horaAberturaMinutos'
                                                    ? 'Abertura'
                                                    : 'Fechamento'}
                                                <TimeTextInput
                                                    key={`${diaSemana}-${campo}-${configuracao[campo]}`}
                                                    value={configuracao[campo]}
                                                    onChange={(valor) =>
                                                        atualizarCampo(
                                                            diaSemana,
                                                            campo,
                                                            valor,
                                                        )
                                                    }
                                                    className="mt-1 h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-gold)]"
                                                />
                                            </label>
                                        ))}
                                    </div>

                                    <Checkbox
                                        className="mt-4"
                                        checked={
                                            configuracao.limiteExtensaoMinutos !==
                                            null
                                        }
                                        onChange={(habilitada) =>
                                            alternarExtensao(
                                                diaSemana,
                                                habilitada,
                                            )
                                        }
                                    >
                                        Permitir extensão após fechamento normal
                                    </Checkbox>

                                    {configuracao.limiteExtensaoMinutos !==
                                        null && (
                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <label className="text-sm text-[var(--color-text-secondary)]">
                                                Último início
                                                <TimeTextInput
                                                    key={`${diaSemana}-ultimoInicio-${configuracao.ultimoInicioExtensaoMinutos}`}
                                                    value={
                                                        configuracao.ultimoInicioExtensaoMinutos ??
                                                        configuracao.horaFechamentoMinutos
                                                    }
                                                    onChange={(valor) =>
                                                        atualizarCampo(
                                                            diaSemana,
                                                            'ultimoInicioExtensaoMinutos',
                                                            valor,
                                                        )
                                                    }
                                                    className="mt-1 h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-gold)]"
                                                />
                                            </label>
                                            <label className="text-sm text-[var(--color-text-secondary)]">
                                                Limite da extensão
                                                <TimeTextInput
                                                    key={`${diaSemana}-limiteExtensao-${configuracao.limiteExtensaoMinutos}`}
                                                    value={
                                                        configuracao.limiteExtensaoMinutos
                                                    }
                                                    onChange={(valor) =>
                                                        atualizarCampo(
                                                            diaSemana,
                                                            'limiteExtensaoMinutos',
                                                            valor,
                                                        )
                                                    }
                                                    className="mt-1 h-11 w-full rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-gold)]"
                                                />
                                            </label>
                                        </div>
                                    )}
                                </>
                            )}
                        </Card>
                    ))}

                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={submetendo}
                        className="min-h-12"
                    >
                        {submetendo ? 'Salvando...' : 'Salvar horários'}
                    </Button>
                </form>
            )}
        </main>
    );
}
