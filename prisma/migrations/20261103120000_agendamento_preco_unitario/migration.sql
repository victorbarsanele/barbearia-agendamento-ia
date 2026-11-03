ALTER TABLE "agendamentos"
ADD COLUMN "precoUnitario" DECIMAL(10, 2);

UPDATE "agendamentos" AS agendamento
SET "precoUnitario" = servico."preco"
FROM "servicos" AS servico
WHERE agendamento."servicoId" = servico."id";