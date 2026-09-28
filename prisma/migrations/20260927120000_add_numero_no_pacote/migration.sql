ALTER TABLE "agendamentos"
ADD COLUMN "numeroNoPacote" INTEGER;

WITH numerados AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY "pacoteClienteId", "servicoId"
            ORDER BY "dataHoraInicio" ASC, id ASC
        )::INTEGER AS numero
    FROM "agendamentos"
    WHERE "pacoteClienteId" IS NOT NULL
      AND status <> 'CANCELADO'
)
UPDATE "agendamentos" AS a
SET "numeroNoPacote" = n.numero
FROM numerados AS n
WHERE a.id = n.id;