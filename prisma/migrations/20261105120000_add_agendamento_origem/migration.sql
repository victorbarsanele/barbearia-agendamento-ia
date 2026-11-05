CREATE TYPE "OrigemAgendamento" AS ENUM ('PAINEL','WHATSAPP_IA');

ALTER TABLE "agendamentos" ADD COLUMN "origem" "OrigemAgendamento";