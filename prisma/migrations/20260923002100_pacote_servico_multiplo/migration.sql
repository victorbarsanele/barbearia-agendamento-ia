/*
  Escopo: somente tabelas pacotes / pacotes_servicos / pacotes_clientes / pacotes_clientes_servicos.
  Nao toca clientes, agendamentos, servicos (exceto FK de leitura) nem qualquer outra tabela.

  Warnings:

  - Coluna `quantidade` de `pacotes` e removida (saldo de fabrica passa a ser por servico em `pacotes_servicos`).
  - Colunas `quantidadeTotal`/`quantidadeRestante` de `pacotes_clientes` sao removidas (saldo passa a ser por servico em `pacotes_clientes_servicos`).
  - Dados de dev existentes sao migrados por backfill abaixo (nao ha dado de producao a preservar).
*/

-- AlterTable: nova coluna nullable primeiro, para permitir backfill antes de tornar NOT NULL
ALTER TABLE "pacotes_servicos" ADD COLUMN "quantidadeTotal" INTEGER;

-- Backfill: copia a quantidade antiga do Pacote para cada linha de PacoteServico (fabrica)
UPDATE "pacotes_servicos" ps
SET "quantidadeTotal" = p."quantidade"
FROM "pacotes" p
WHERE p."id" = ps."pacoteId";

ALTER TABLE "pacotes_servicos" ALTER COLUMN "quantidadeTotal" SET NOT NULL;

-- CreateTable
CREATE TABLE "pacotes_clientes_servicos" (
    "id" TEXT NOT NULL,
    "pacoteClienteId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "quantidadeTotal" INTEGER NOT NULL,
    "quantidadeRestante" INTEGER NOT NULL,

    CONSTRAINT "pacotes_clientes_servicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pacotes_clientes_servicos_servicoId_idx" ON "pacotes_clientes_servicos"("servicoId");

-- CreateIndex
CREATE UNIQUE INDEX "pacotes_clientes_servicos_pacoteClienteId_servicoId_key" ON "pacotes_clientes_servicos"("pacoteClienteId", "servicoId");

-- AddForeignKey
ALTER TABLE "pacotes_clientes_servicos" ADD CONSTRAINT "pacotes_clientes_servicos_pacoteClienteId_fkey" FOREIGN KEY ("pacoteClienteId") REFERENCES "pacotes_clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacotes_clientes_servicos" ADD CONSTRAINT "pacotes_clientes_servicos_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: para cada PacoteCliente existente, cria uma linha de saldo por servico do pacote.
-- O saldo restante agregado antigo e preservado na primeira linha por pacote vendido;
-- linhas adicionais recebem zero, pois modelo antigo nao registrava saldo por servico.
-- id gerado de forma deterministica (sem extensao de banco), respeitando a unique (pacoteClienteId, servicoId).
INSERT INTO "pacotes_clientes_servicos" ("id", "pacoteClienteId", "servicoId", "quantidadeTotal", "quantidadeRestante")
SELECT
    'pcs_' || pc."id" || '_' || ps."servicoId",
    pc."id",
    ps."servicoId",
    ps."quantidadeTotal",
    CASE
      WHEN ROW_NUMBER() OVER (
        PARTITION BY pc."id"
        ORDER BY ps."servicoId"
      ) = 1 THEN pc."quantidadeRestante"
      ELSE 0
    END
FROM "pacotes_clientes" pc
JOIN "pacotes_servicos" ps ON ps."pacoteId" = pc."pacoteId";

-- AlterTable: remove colunas legadas de saldo agregado (fonte de verdade agora e pacotes_clientes_servicos)
ALTER TABLE "pacotes_clientes" DROP COLUMN "quantidadeRestante",
DROP COLUMN "quantidadeTotal";

-- AlterTable: remove quantidade unica do Pacote (fonte de verdade agora e pacotes_servicos.quantidadeTotal)
ALTER TABLE "pacotes" DROP COLUMN "quantidade";
