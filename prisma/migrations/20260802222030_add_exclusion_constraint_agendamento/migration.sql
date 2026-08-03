CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE agendamentos
ADD CONSTRAINT sem_sobreposicao_horario
EXCLUDE USING gist (
    tstzrange("dataHoraInicio", "dataHoraFim", '[)') WITH &&
) WHERE (status <> 'CANCELADO'::"StatusAgendamento");
