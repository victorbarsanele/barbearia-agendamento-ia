CREATE TYPE "OrigemConclusaoAgendamento" AS ENUM ('MANUAL', 'AUTOMATICO');

ALTER TABLE "agendamentos"
ADD COLUMN "concluidoEm" TIMESTAMPTZ(3),
ADD COLUMN "concluidoPor" "OrigemConclusaoAgendamento";
