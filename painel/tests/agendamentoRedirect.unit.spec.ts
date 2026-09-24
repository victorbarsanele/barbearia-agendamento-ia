import { expect, test } from '@playwright/test';
import { getAgendaUrlForAgendamento } from '../src/utils/agendamentoNavigation.js';

test('redirect de agendamento avulso preserva data em Brasília', () => {
    expect(
        getAgendaUrlForAgendamento('2026-09-24T00:30:00-03:00'),
    ).toBe('/?data=2026-09-24');
});