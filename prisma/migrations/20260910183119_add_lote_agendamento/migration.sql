-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "loteId" TEXT;

-- CreateTable
CREATE TABLE "lotes_agendamento" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "pacoteClienteId" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotes_agendamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lotes_agendamento_clienteId_idx" ON "lotes_agendamento"("clienteId");

-- CreateIndex
CREATE INDEX "lotes_agendamento_servicoId_idx" ON "lotes_agendamento"("servicoId");

-- CreateIndex
CREATE INDEX "agendamentos_loteId_idx" ON "agendamentos"("loteId");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_loteId_fkey" FOREIGN KEY ("loteId") REFERENCES "lotes_agendamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_agendamento" ADD CONSTRAINT "lotes_agendamento_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes_agendamento" ADD CONSTRAINT "lotes_agendamento_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
