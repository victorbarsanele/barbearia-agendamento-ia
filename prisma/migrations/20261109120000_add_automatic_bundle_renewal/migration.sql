ALTER TABLE "pacotes_clientes"
ADD COLUMN "renovadoDeId" TEXT;

CREATE UNIQUE INDEX "pacotes_clientes_renovadoDeId_key"
ON "pacotes_clientes"("renovadoDeId");

ALTER TABLE "pacotes_clientes"
ADD CONSTRAINT "pacotes_clientes_renovadoDeId_fkey"
FOREIGN KEY ("renovadoDeId") REFERENCES "pacotes_clientes"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;