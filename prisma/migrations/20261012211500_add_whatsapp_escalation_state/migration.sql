-- CreateEnum
CREATE TYPE "EstadoEscalonamento" AS ENUM ('BOT', 'ESCALADO', 'HUMANO_ATIVO');

-- CreateTable
CREATE TABLE "escalonamentos_whatsapp" (
    "telefone" TEXT NOT NULL,
    "estado" "EstadoEscalonamento" NOT NULL DEFAULT 'BOT',
    "motivo" TEXT,
    "escaladoEm" TIMESTAMP(3) WITH TIME ZONE,
    "avisoEsperaEnviadoEm" TIMESTAMP(3) WITH TIME ZONE,
    "humanoUltimaMensagemEm" TIMESTAMP(3) WITH TIME ZONE,
    "expiraEm" TIMESTAMP(3) WITH TIME ZONE,
    "atualizadoEm" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalonamentos_whatsapp_pkey" PRIMARY KEY ("telefone")
);
