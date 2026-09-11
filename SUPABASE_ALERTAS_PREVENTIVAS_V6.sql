-- ALERTA OTAMENDI · ALERTAS PREVENTIVAS AGRUPADAS V6
-- Ejecutar una sola vez en Supabase SQL Editor.

ALTER TABLE "PersonPatternAlert"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'Persona sospechosa',
  ADD COLUMN IF NOT EXISTS "notificationSentAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PersonPatternAlert_category_idx"
  ON "PersonPatternAlert"("category");
