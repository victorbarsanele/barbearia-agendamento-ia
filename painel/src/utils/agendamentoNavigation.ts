import { getBrazilDateKey } from './dateTime.js';

export function getAgendaUrlForAgendamento(dataHoraInicio: string): string {
    return `/?data=${getBrazilDateKey(new Date(dataHoraInicio))}`;
}