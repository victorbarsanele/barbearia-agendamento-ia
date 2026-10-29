CREATE TABLE "numeros_ignorados_whatsapp" (
    "id" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "rotulo" TEXT NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "numeros_ignorados_whatsapp_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "numeros_ignorados_whatsapp_telefone_key" UNIQUE ("telefone")
);