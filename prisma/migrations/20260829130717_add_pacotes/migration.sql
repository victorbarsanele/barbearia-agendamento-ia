-- CreateEnum
CREATE TYPE "StatusPacoteCliente" AS ENUM ('ATIVO', 'FINALIZADO');

-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN     "concluido" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pacoteClienteId" TEXT;

-- CreateTable
CREATE TABLE "pacotes" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "duracaoDias" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pacotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacotes_servicos" (
    "pacoteId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,

    CONSTRAINT "pacotes_servicos_pkey" PRIMARY KEY ("pacoteId","servicoId")
);

-- CreateTable
CREATE TABLE "pacotes_clientes" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "pacoteId" TEXT NOT NULL,
    "quantidadeTotal" INTEGER NOT NULL,
    "quantidadeRestante" INTEGER NOT NULL,
    "dataInicio" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusPacoteCliente" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pacotes_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pacotes_servicos_servicoId_idx" ON "pacotes_servicos"("servicoId");

-- CreateIndex
CREATE INDEX "pacotes_clientes_clienteId_idx" ON "pacotes_clientes"("clienteId");

-- CreateIndex
CREATE INDEX "pacotes_clientes_pacoteId_idx" ON "pacotes_clientes"("pacoteId");

-- CreateIndex
CREATE INDEX "pacotes_clientes_clienteId_status_idx" ON "pacotes_clientes"("clienteId", "status");

-- CreateIndex
CREATE INDEX "agendamentos_pacoteClienteId_idx" ON "agendamentos"("pacoteClienteId");

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_pacoteClienteId_fkey" FOREIGN KEY ("pacoteClienteId") REFERENCES "pacotes_clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacotes_servicos" ADD CONSTRAINT "pacotes_servicos_pacoteId_fkey" FOREIGN KEY ("pacoteId") REFERENCES "pacotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacotes_servicos" ADD CONSTRAINT "pacotes_servicos_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacotes_clientes" ADD CONSTRAINT "pacotes_clientes_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacotes_clientes" ADD CONSTRAINT "pacotes_clientes_pacoteId_fkey" FOREIGN KEY ("pacoteId") REFERENCES "pacotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
