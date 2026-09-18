import * as horarioFuncionamentoRepository from '../repositories/horarioFuncionamento.repository';
import { AppError } from '../lib/app-error';
import {
    ehDiaDeFuncionamento as ehDiaDeFuncionamentoPuro,
    estaDentroDoHorarioDeFuncionamento as estaDentroDoHorarioDeFuncionamentoPuro,
    estaDentroDoHorarioDoAgendamento as estaDentroDoHorarioDoAgendamentoPuro,
    obterHorarioFuncionamento as obterHorarioFuncionamentoPuro,
    TIME_ZONE,
    type HorarioFuncionamentoConfig,
} from './horario-funcionamento';

export { TIME_ZONE };
export type { HorarioFuncionamentoConfig };

export async function carregarConfiguracao(): Promise<
    HorarioFuncionamentoConfig[]
> {
    return horarioFuncionamentoRepository.listarTodos();
}

export async function obterHorarioFuncionamento(
    data: Date,
): Promise<HorarioFuncionamentoConfig | null> {
    return obterHorarioFuncionamentoPuro(await carregarConfiguracao(), data);
}

export async function ehDiaDeFuncionamento(data: Date): Promise<boolean> {
    return ehDiaDeFuncionamentoPuro(await carregarConfiguracao(), data);
}

export async function estaDentroDoHorarioDeFuncionamento(
    data: Date,
): Promise<boolean> {
    return estaDentroDoHorarioDeFuncionamentoPuro(
        await carregarConfiguracao(),
        data,
    );
}

export async function estaDentroDoHorarioDoAgendamento(
    inicio: Date,
    fim: Date,
    permiteExtensaoFechamento = false,
): Promise<boolean> {
    return estaDentroDoHorarioDoAgendamentoPuro(
        await carregarConfiguracao(),
        inicio,
        fim,
        permiteExtensaoFechamento,
    );
}

export async function listarConfiguracao(): Promise<
    Array<HorarioFuncionamentoConfig | null>
> {
    const configuracoes = await carregarConfiguracao();
    return Array.from(
        { length: 7 },
        (_, diaSemana) =>
            configuracoes.find((item) => item.diaSemana === diaSemana) ?? null,
    );
}

export async function atualizarConfiguracao(
    configuracoes: Array<HorarioFuncionamentoConfig | null>,
): Promise<Array<HorarioFuncionamentoConfig | null>> {
    if (configuracoes.length !== 7) {
        throw new AppError(
            'A configuração deve conter os 7 dias da semana.',
            400,
        );
    }

    const validas = configuracoes.filter(
        (configuracao): configuracao is HorarioFuncionamentoConfig =>
            configuracao !== null,
    );

    if (validas.some((configuracao) => configuracao.diaSemana === 0)) {
        throw new AppError(
            'Domingo não deve possuir horário de funcionamento.',
            400,
        );
    }

    const dias = new Set(validas.map((configuracao) => configuracao.diaSemana));
    if (
        dias.size !== validas.length ||
        validas.some(
            (configuracao) =>
                configuracao.diaSemana < 1 || configuracao.diaSemana > 6,
        )
    ) {
        throw new AppError('Dias da semana inválidos.', 400);
    }

    for (const configuracao of validas) {
        if (
            configuracao.horaAberturaMinutos < 0 ||
            configuracao.horaAberturaMinutos > 24 * 60 ||
            configuracao.horaFechamentoMinutos < 0 ||
            configuracao.horaFechamentoMinutos > 24 * 60 ||
            configuracao.horaAberturaMinutos >=
                configuracao.horaFechamentoMinutos
        ) {
            throw new AppError(
                'Horário de abertura e fechamento inválido.',
                400,
            );
        }

        const temAlmoco =
            configuracao.almocoInicioMinutos !== null ||
            configuracao.almocoFimMinutos !== null;
        if (
            temAlmoco &&
            (configuracao.almocoInicioMinutos === null ||
                configuracao.almocoFimMinutos === null)
        ) {
            throw new AppError(
                'Horário de início e fim do almoço devem ser informados juntos.',
                400,
            );
        }

        if (
            configuracao.almocoInicioMinutos !== null &&
            configuracao.almocoFimMinutos !== null &&
            (configuracao.almocoInicioMinutos < configuracao.horaAberturaMinutos ||
                configuracao.almocoFimMinutos >
                    configuracao.horaFechamentoMinutos ||
                configuracao.almocoInicioMinutos >=
                    configuracao.almocoFimMinutos)
        ) {
            throw new AppError(
                'Horário de almoço deve estar dentro do funcionamento e ter início antes do fim.',
                400,
            );
        }

        const temExtensao =
            configuracao.limiteExtensaoMinutos !== null ||
            configuracao.ultimoInicioExtensaoMinutos !== null;
        if (
            temExtensao &&
            (configuracao.limiteExtensaoMinutos === null ||
                configuracao.ultimoInicioExtensaoMinutos === null ||
                configuracao.limiteExtensaoMinutos <=
                    configuracao.horaFechamentoMinutos)
        ) {
            throw new AppError('Horário de extensão inválido.', 400);
        }
    }

    await horarioFuncionamentoRepository.atualizarTodos(validas);
    return listarConfiguracao();
}

export function obterHorarioFuncionamentoComConfiguracao(
    configuracao: HorarioFuncionamentoConfig[],
    data: Date,
): HorarioFuncionamentoConfig | null {
    return obterHorarioFuncionamentoPuro(configuracao, data);
}

export function ehDiaDeFuncionamentoComConfiguracao(
    configuracao: HorarioFuncionamentoConfig[],
    data: Date,
): boolean {
    return ehDiaDeFuncionamentoPuro(configuracao, data);
}

export function estaDentroDoHorarioDeFuncionamentoComConfiguracao(
    configuracao: HorarioFuncionamentoConfig[],
    data: Date,
): boolean {
    return estaDentroDoHorarioDeFuncionamentoPuro(configuracao, data);
}

export function estaDentroDoHorarioDoAgendamentoComConfiguracao(
    configuracao: HorarioFuncionamentoConfig[],
    inicio: Date,
    fim: Date,
    permiteExtensaoFechamento = false,
): boolean {
    return estaDentroDoHorarioDoAgendamentoPuro(
        configuracao,
        inicio,
        fim,
        permiteExtensaoFechamento,
    );
}
