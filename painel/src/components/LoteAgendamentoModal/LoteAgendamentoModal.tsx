import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Cliente } from '../../services/clientes.service';
import {
    ApiError,
    criarLoteAgendamentos,
    simularLoteAgendamentos,
    type SlotLote,
} from '../../services/agendamentos.service';
import { listarServicos, type Servico } from '../../services/servicos.service';
import type { Pacote } from '../../services/pacotes.service';
import { formatBrazilDateKey } from '../../utils/dateTime';
import {
    calcularLimiteSlotsPacoteCatalogo,
    montarPayloadLote,
    traduzirMotivoConflitoLote,
} from '../../utils/pacoteCatalogo';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { IconButton } from '../ui/IconButton';
import { SeletorClienteServico } from './SeletorClienteServico';
import { GeradorRepeticao } from './GeradorRepeticao';
import { CalendarioSelecaoMultipla } from './CalendarioSelecaoMultipla';
import { PainelResolucaoConflitos } from './PainelResolucaoConflitos';
import { ResumoConfirmacaoLote } from './ResumoConfirmacaoLote';

type Etapa = 'seletor' | 'datas' | 'conflitos' | 'resumo' | 'resultado';

interface ConflitoSlot extends SlotLote {
    motivo: string;
}

interface CriacaoLoteResult {
    criados: { agendamentoId: string; data: string; horario: string }[];
    falhados: (SlotLote & { motivo: string })[];
}

const MENSAGEM_PACOTE_ATIVO_DIVERGENTE =
    'Cliente já possui pacote ativo diferente do pacote selecionado.';

interface LoteAgendamentoModalProps {
    aberto: boolean;
    onFechar: () => void;
    onSucesso: () => void;
}

export function LoteAgendamentoModal({
    aberto,
    onFechar,
    onSucesso,
}: LoteAgendamentoModalProps) {
    const [etapa, setEtapa] = useState<Etapa>('seletor');
    const [clienteSelecionado, setClienteSelecionado] =
        useState<Cliente | null>(null);
    const [servicoId, setServicoId] = useState('');
    const [servicoNome, setServicoNome] = useState('');
    const [pacoteClienteId, setPacoteClienteId] = useState<string | undefined>(
        undefined,
    );
    const [pacoteCatalogoId, setPacoteCatalogoId] = useState('');
    const [pacoteCatalogo, setPacoteCatalogo] = useState<Pacote | null>(null);
    const [recarregarPacoteAtivo, setRecarregarPacoteAtivo] = useState(0);

    const [slotsSelecionados, setSlotsSelecionados] = useState<SlotLote[]>([]);
    const [temRecorrencia, setTemRecorrencia] = useState(false);
    const [conflitos, setConflitos] = useState<ConflitoSlot[]>([]);
    const [verificandoSlot, setVerificandoSlot] = useState<string | null>(null);

    const [simulando, setSimulando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [simulacaoValida, setSimulacaoValida] = useState(false);
    const [resultadoCriacao, setResultadoCriacao] =
        useState<CriacaoLoteResult | null>(null);

    const quantidadeDoServicoNoPacote = pacoteCatalogo?.servicos.find(
        (item) => item.servicoId === servicoId,
    )?.quantidadeTotal;
    const limiteSlots = pacoteCatalogo
        ? calcularLimiteSlotsPacoteCatalogo(quantidadeDoServicoNoPacote)
        : null;
    const excedeLimite =
        limiteSlots !== null && slotsSelecionados.length > limiteSlots;

    const podeConfirmar = useMemo(
        () =>
            simulacaoValida &&
            slotsSelecionados.length > 0 &&
            conflitos.length === 0 &&
            !excedeLimite,
        [simulacaoValida, slotsSelecionados, conflitos, excedeLimite],
    );

    if (!aberto) {
        return null;
    }

    const resetar = () => {
        setEtapa('seletor');
        setClienteSelecionado(null);
        setServicoId('');
        setServicoNome('');
        setPacoteClienteId(undefined);
        setPacoteCatalogoId('');
        setPacoteCatalogo(null);
        setSlotsSelecionados([]);
        setTemRecorrencia(false);
        setConflitos([]);
        setSimulacaoValida(false);
        setResultadoCriacao(null);
        setErro(null);
    };

    const fechar = () => {
        resetar();
        onFechar();
    };

    const invalidarSimulacao = () => {
        setSimulacaoValida(false);
        setConflitos([]);
        setErro(null);
    };

    const alterarSlots = (slots: SlotLote[]) => {
        setSlotsSelecionados(slots);
        invalidarSimulacao();
    };

    const alterarCliente = (cliente: Cliente | null) => {
        if (clienteSelecionado?.id !== cliente?.id) {
            setServicoId('');
            setServicoNome('');
            setPacoteClienteId(undefined);
            setPacoteCatalogoId('');
            setPacoteCatalogo(null);
            invalidarSimulacao();
        }
        setClienteSelecionado(cliente);
    };

    const alterarServico = (id: string) => {
        if (id !== servicoId) {
            invalidarSimulacao();
        }
        setServicoId(id);
    };

    const alterarPacoteCatalogo = (id: string) => {
        if (id !== pacoteCatalogoId) {
            invalidarSimulacao();
        }
        setPacoteCatalogoId(id);
    };

    const montarPayload = (slots: SlotLote[]) =>
        montarPayloadLote(
            {
                clienteId: clienteSelecionado!.id,
                servicoId,
                slots,
            },
            pacoteCatalogoId
                ? { tipo: 'catalogo', pacoteId: pacoteCatalogoId }
                : pacoteClienteId
                  ? { tipo: 'ativo', pacoteClienteId }
                  : { tipo: 'nenhum' },
        );

    const alternarRecorrencia = (ativo: boolean) => {
        setTemRecorrencia(ativo);
        alterarSlots([]);
    };

    const irParaGeracaoDeDatas = async () => {
        if (!clienteSelecionado?.id || !servicoId) {
            setErro('Selecione um cliente e um serviço.');
            return;
        }

        const servicos: Servico[] = await listarServicos().catch(() => []);
        setServicoNome(
            servicos.find((servico) => servico.id === servicoId)?.nome ?? '',
        );
        setErro(null);
        setEtapa('datas');
    };

    const simularSlots = async (slots: SlotLote[]) => {
        if (!clienteSelecionado?.id || !servicoId) {
            return;
        }

        if (limiteSlots !== null && slots.length > limiteSlots) {
            setErro(
                `Selecione no máximo ${limiteSlots} horários para este pacote e serviço.`,
            );
            setSimulacaoValida(false);
            setConflitos([]);
            return;
        }

        setSimulando(true);
        setErro(null);

        try {
            const resultado = await simularLoteAgendamentos(
                montarPayload(slots),
            );

            setConflitos(resultado.conflitos);
            setSimulacaoValida(true);
            setEtapa('conflitos');
        } catch (error) {
            setErro(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível simular o lote.',
            );
        } finally {
            setSimulando(false);
        }
    };

    const simularConflitos = async () => simularSlots(slotsSelecionados);

    const removerSlotConflitante = async (slot: SlotLote) => {
        const slots = slotsSelecionados.filter(
            (item) => item.data !== slot.data || item.horario !== slot.horario,
        );
        alterarSlots(slots);
        if (slots.length > 0) {
            await simularSlots(slots);
        } else {
            setEtapa('datas');
        }
    };

    const escolherNovoHorario = async (
        slotAntigo: SlotLote,
        novoHorario: string,
    ) => {
        if (!clienteSelecionado?.id || !servicoId) {
            return;
        }

        const chave = `${slotAntigo.data}-${slotAntigo.horario}`;
        setVerificandoSlot(chave);

        try {
            const slots = slotsSelecionados.map((item) =>
                item.data === slotAntigo.data &&
                item.horario === slotAntigo.horario
                    ? { data: slotAntigo.data, horario: novoHorario }
                    : item,
            );
            alterarSlots(slots);
            await simularSlots(slots);
        } finally {
            setVerificandoSlot(null);
        }
    };

    const confirmarLote = async () => {
        if (!clienteSelecionado?.id || !servicoId) {
            return;
        }

        setEnviando(true);
        setErro(null);

        try {
            const resultado = await criarLoteAgendamentos(
                montarPayload(slotsSelecionados),
            );
            if (!pacoteCatalogoId && resultado.falhados.length > 0) {
                setResultadoCriacao(resultado);
                setEtapa('resultado');
                return;
            }
            onSucesso();
            fechar();
        } catch (error) {
            if (
                pacoteCatalogoId &&
                error instanceof ApiError &&
                error.status === 409 &&
                error.message === MENSAGEM_PACOTE_ATIVO_DIVERGENTE
            ) {
                setPacoteCatalogoId('');
                setPacoteCatalogo(null);
                setPacoteClienteId(undefined);
                setConflitos([]);
                setSimulacaoValida(false);
                setRecarregarPacoteAtivo((atual) => atual + 1);
                setEtapa('seletor');
                setErro(
                    `${error.message} Consulta atualizada; escolha novamente como vincular o pacote.`,
                );
            } else if (pacoteCatalogoId) {
                const falha = error instanceof ApiError ? error.body : null;
                const message =
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível criar o lote de agendamentos.';
                if (falha?.slot && typeof falha.motivo === 'string') {
                    setErro(
                        `${formatBrazilDateKey(falha.slot.data)} às ${falha.slot.horario}: ${traduzirMotivoConflitoLote(falha.motivo)} Nada foi criado.`,
                    );
                } else {
                    setErro(`${message} Nada foi criado.`);
                }
            } else {
                setErro(
                    error instanceof Error
                        ? error.message
                        : 'Não foi possível criar o lote de agendamentos.',
                );
            }
        } finally {
            setEnviando(false);
        }
    };

    const concluirResultadoParcial = () => {
        onSucesso();
        fechar();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
            role="presentation"
        >
            <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto space-y-4 p-6">
                <div className="flex items-center justify-between">
                    <h2
                        className="text-2xl font-bold text-[var(--color-gold)]"
                        style={{ fontFamily: 'var(--font-title)' }}
                    >
                        Agendar em lote
                    </h2>
                    <IconButton
                        type="button"
                        onClick={fechar}
                        ariaLabel="Fechar"
                    >
                        <X className="h-4 w-4" />
                    </IconButton>
                </div>

                {erro && (
                    <p className="text-sm text-[var(--color-danger)]">{erro}</p>
                )}

                {etapa === 'seletor' && (
                    <div className="space-y-4">
                        <SeletorClienteServico
                            clienteSelecionado={clienteSelecionado}
                            servicoId={servicoId}
                            pacoteClienteId={pacoteClienteId}
                            modoCatalogoLote
                            pacoteCatalogoId={pacoteCatalogoId}
                            recarregarPacoteAtivo={recarregarPacoteAtivo}
                            aoMudarPacoteCatalogo={alterarPacoteCatalogo}
                            aoSelecionarPacoteCatalogo={setPacoteCatalogo}
                            onClienteChange={alterarCliente}
                            onServicoChange={alterarServico}
                            onPacoteClienteChange={(id) => {
                                if (id !== pacoteClienteId) {
                                    invalidarSimulacao();
                                }
                                setPacoteClienteId(id);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void irParaGeracaoDeDatas()}
                            className="h-10 w-full rounded-[8px] bg-[var(--color-gold)] text-sm font-semibold text-black"
                        >
                            Próximo
                        </button>
                    </div>
                )}

                {etapa === 'datas' && (
                    <div className="space-y-6">
                        {limiteSlots !== null && (
                            <div>
                                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                                    {slotsSelecionados.length} de {limiteSlots}{' '}
                                    horários
                                </p>
                                {excedeLimite && (
                                    <p
                                        className="mt-1 text-sm text-[var(--color-danger)]"
                                        role="alert"
                                    >
                                        Este pacote permite no máximo{' '}
                                        {limiteSlots} horários para o serviço.
                                    </p>
                                )}
                            </div>
                        )}
                        {temRecorrencia && (
                            <div className="flex justify-center">
                                <Checkbox
                                    checked={temRecorrencia}
                                    onChange={alternarRecorrencia}
                                    className="text-[var(--color-text-primary)]"
                                >
                                    Há recorrência
                                </Checkbox>
                            </div>
                        )}

                        {!temRecorrencia && (
                            <CalendarioSelecaoMultipla
                                slots={slotsSelecionados}
                                onChange={alterarSlots}
                            />
                        )}

                        {!temRecorrencia && (
                            <div className="flex justify-center">
                                <Checkbox
                                    checked={temRecorrencia}
                                    onChange={alternarRecorrencia}
                                    className="text-[var(--color-text-primary)]"
                                >
                                    Há recorrência
                                </Checkbox>
                            </div>
                        )}

                        {temRecorrencia && (
                            <GeradorRepeticao
                                maxSlots={limiteSlots ?? undefined}
                                onGerar={alterarSlots}
                                onAlterar={() => alterarSlots([])}
                                onErro={setErro}
                            />
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={
                                    slotsSelecionados.length === 0 ||
                                    simulando ||
                                    excedeLimite
                                }
                                onClick={() => void simularConflitos()}
                                className="h-10 flex-1 rounded-[8px] bg-[var(--color-gold)] text-sm font-semibold text-black disabled:opacity-50"
                            >
                                {simulando ? 'Simulando...' : 'Simular'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEtapa('seletor')}
                                className="h-10 flex-1 rounded-[8px] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-primary)]"
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                )}

                {etapa === 'conflitos' && (
                    <div className="space-y-4">
                        <PainelResolucaoConflitos
                            conflitos={conflitos}
                            verificando={verificandoSlot}
                            onRemoverSlot={removerSlotConflitante}
                            onEscolherNovoHorario={escolherNovoHorario}
                        />
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={!podeConfirmar}
                                onClick={() => setEtapa('resumo')}
                                className="h-10 flex-1 rounded-[8px] bg-[var(--color-gold)] text-sm font-semibold text-black disabled:opacity-50"
                            >
                                Avançar
                            </button>
                            <button
                                type="button"
                                onClick={() => setEtapa('datas')}
                                className="h-10 flex-1 rounded-[8px] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-text-primary)]"
                            >
                                Voltar
                            </button>
                        </div>
                    </div>
                )}

                {etapa === 'resumo' && (
                    <ResumoConfirmacaoLote
                        clienteNome={clienteSelecionado?.nome ?? ''}
                        servicoNome={servicoNome}
                        slots={slotsSelecionados}
                        pacoteClienteId={pacoteClienteId}
                        pacoteCatalogo={pacoteCatalogo}
                        atomic={Boolean(pacoteCatalogoId)}
                        enviando={enviando}
                        erro={null}
                        onConfirmar={() => void confirmarLote()}
                        onVoltar={() => setEtapa('conflitos')}
                    />
                )}

                {etapa === 'resultado' && resultadoCriacao && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
                            Lote parcialmente criado
                        </h3>
                        <p className="text-sm text-[var(--color-text-secondary)]">
                            {resultadoCriacao.criados.length} criados ·{' '}
                            {resultadoCriacao.falhados.length} falharam.
                        </p>
                        <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">
                            {resultadoCriacao.falhados.map((slot) => (
                                <li
                                    key={`${slot.data}-${slot.horario}`}
                                    className="rounded-[6px] border border-[var(--color-danger)]/30 p-2"
                                >
                                    <p className="font-semibold text-[var(--color-text-primary)]">
                                        {formatBrazilDateKey(slot.data)} às{' '}
                                        {slot.horario}
                                    </p>
                                    <p className="text-[var(--color-danger)]">
                                        {slot.motivo}
                                    </p>
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={concluirResultadoParcial}
                            className="h-10 w-full rounded-[8px] bg-[var(--color-gold)] text-sm font-semibold text-black"
                        >
                            Atualizar agenda
                        </button>
                    </div>
                )}
            </Card>
        </div>
    );
}
