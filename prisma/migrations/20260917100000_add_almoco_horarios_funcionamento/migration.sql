-- AlterTable
ALTER TABLE "horarios_funcionamento"
ADD COLUMN "almocoInicioMinutos" INTEGER,
ADD COLUMN "almocoFimMinutos" INTEGER;

-- Preserve current fixed lunch interval for existing configured days.
UPDATE "horarios_funcionamento"
SET "almocoInicioMinutos" = 690,
    "almocoFimMinutos" = 720;
