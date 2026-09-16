CREATE TYPE "EscopoBloqueio" AS ENUM ('TODOS', 'SO_PAINEL');
CREATE TYPE "RecorrenciaBloqueio" AS ENUM ('PONTUAL', 'SEMANAL');

ALTER TABLE "bloqueios_horario"
    ALTER COLUMN "dataHoraInicio" DROP NOT NULL,
    ALTER COLUMN "dataHoraFim" DROP NOT NULL,
    ADD COLUMN "escopo" "EscopoBloqueio" NOT NULL DEFAULT 'TODOS',
    ADD COLUMN "recorrencia" "RecorrenciaBloqueio" NOT NULL DEFAULT 'PONTUAL',
    ADD COLUMN "diaSemana" INTEGER,
    ADD COLUMN "horaInicioMinutos" INTEGER,
    ADD COLUMN "horaFimMinutos" INTEGER;

CREATE INDEX "bloqueios_horario_recorrencia_diaSemana_idx"
    ON "bloqueios_horario"("recorrencia", "diaSemana");