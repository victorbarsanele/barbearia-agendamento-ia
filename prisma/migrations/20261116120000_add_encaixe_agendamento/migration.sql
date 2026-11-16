ALTER TABLE "agendamentos"
ADD COLUMN "encaixe" BOOLEAN NOT NULL DEFAULT false;

-- Prisma does not model PostgreSQL exclusion constraints, so this constraint is recreated manually.
ALTER TABLE "agendamentos"
DROP CONSTRAINT "sem_sobreposicao_horario",
ADD CONSTRAINT "sem_sobreposicao_horario"
EXCLUDE USING gist (
    tstzrange("dataHoraInicio", "dataHoraFim", '[)') WITH &&
) WHERE (status <> 'CANCELADO'::"StatusAgendamento" AND NOT "encaixe");