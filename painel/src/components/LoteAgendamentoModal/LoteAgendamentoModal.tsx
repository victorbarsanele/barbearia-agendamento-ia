import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Cliente } from '../../services/clientes.service';
import {
    criarLoteAgendamentos,
    simularLoteAgendamentos,
    type SlotLote,
} from '../../services/agendamentos.service';
import { listarServicos, type Servico } from '../../services/servicos.service';
import { Card } from '../ui/Card';
import { Checkbox } from '../ui/Checkbox';
import { Button } from '../ui/Button';
import { SeletorClienteServico } from './SeletorClienteServico';
import { GeradorRepeticao } from './GeradorRepeticao';
import { CalendarioSelecaoMultipla } from './CalendarioSelecaoMultipla';
import { PainelResolucaoConflitos } from './PainelResolucaoConflitos';
import { ResumoConfirmacaoLote } from './ResumoConfirmacaoLote';

type Etapa = 'seletor' | 'datas' | 'conflitos' | 'resumo';

interface ConflitoSlot extends SlotLote {
    motivo: string;
}

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

    const [slotsSelecionados, setSlotsSelecionados] = useState<SlotLote[]>([]);
    const [temRecorrencia, setTemRecorrencia] = useState(false);
    const [conflitos, setConflitos] = useState<ConflitoSlot[]>([]);
    const [verificandoSlot, setVerificandoSlot] = useState<string | null>(null);

    const [simulando, setSimulando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const podeConfirmar = useMemo(
        () => slotsSelecionados.length > 0 && conflitos.length === 0,
        [slotsSelecionados, conflitos],
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
        setSlotsSelecionados([]);
        setTemRecorrencia(false);
        setConflitos([]);
        setErro(null);
    };

    const fechar = () => {
        resetar();
        onFechar();
    };

    const alternarRecorrencia = (ativo: boolean) => {
        setTemRecorrencia(ativo);
        setSlotsSelecionados([]);
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

    const simularConflitos = async () => {
        if (!clienteSelecionado?.id || !servicoId) {
            return;
        }

        setSimulando(true);
        setErro(null);

        try {
            const resultado = await simularLoteAgendamentos({
                clienteId: clienteSelecionado.id,
                servicoId,
                pacoteClienteId,
                slots: slotsSelecionados,
            });

            setConflitos(resultado.conflitos);
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

    const removerSlotConflitante = (slot: SlotLote) => {
        setSlotsSelecionados((current) =>
            current.filter(
                (item) =>
                    item.data !== slot.data || item.horario !== slot.horario,
            ),
        );
        setConflitos((current) =>
            current.filter(
                (item) =>
                    item.data !== slot.data || item.horario !== slot.horario,
            ),
        );
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
            const resultado = await simularLoteAgendamentos({
                clienteId: clienteSelecionado.id,
                servicoId,
                pacoteClienteId,
                slots: [{ data: slotAntigo.data, horario: novoHorario }],
            });

            if (resultado.conflitos.length === 0) {
                setSlotsSelecionados((current) =>
                    current.map((item) =>
                        item.data === slotAntigo.data &&
                        item.horario === slotAntigo.horario
                            ? { data: slotAntigo.data, horario: novoHorario }
                            : item,
                    ),
                );
                setConflitos((current) =>
                    current.filter(
                        (item) =>
                            item.data !== slotAntigo.data ||
                            item.horario !== slotAntigo.horario,
                    ),
                );
            } else {
                setConflitos((current) =>
                    current.map((item) =>
                        item.data === slotAntigo.data &&
                        item.horario === slotAntigo.horario
                            ? {
                                  data: slotAntigo.data,
                                  horario: novoHorario,
                                  motivo: resultado.conflitos[0].motivo,
                              }
                            : item,
                    ),
                );
            }
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
            await criarLoteAgendamentos({
                clienteId: clienteSelecionado.id,
                servicoId,
                pacoteClienteId,
                slots: slotsSelecionados,
            });
            onSucesso();
            fechar();
        } catch (error) {
            setErro(
                error instanceof Error
                    ? error.message
                    : 'Não foi possível criar o lote de agendamentos.',
            );
        } finally {
            setEnviando(false);
        }
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
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={fechar}
                        className="min-h-8 w-8 px-0"
                        aria-label="Fechar"
                    >
                        <X className="h-4 w-4" />
                    </Button>
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
                            onClienteChange={setClienteSelecionado}
                            onServicoChange={setServicoId}
                            onPacoteClienteChange={setPacoteClienteId}
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
                                onChange={setSlotsSelecionados}
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
                            <GeradorRepeticao onGerar={setSlotsSelecionados} />
                        )}

                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={
                                    slotsSelecionados.length === 0 || simulando
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
                        enviando={enviando}
                        erro={null}
                        onConfirmar={() => void confirmarLote()}
                        onVoltar={() => setEtapa('conflitos')}
                    />
                )}
            </Card>
        </div>
    );
}
