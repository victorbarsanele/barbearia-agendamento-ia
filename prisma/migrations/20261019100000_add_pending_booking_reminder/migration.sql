ALTER TABLE "rascunhos_agendamento"
ADD COLUMN IF NOT EXISTS "lembreteEnviadoEm" TIMESTAMPTZ(3),
ADD COLUMN IF NOT EXISTS "resumoEnviadoEm" TIMESTAMPTZ(3);
