-- ALARMA OTAMENDI / CENTRO DE MONITOREO
-- Suscripciones: mensual, anual, prueba, cortesía + Mercado Pago
-- Ejecutar UNA VEZ en Supabase > SQL Editor.

ALTER TABLE "MonitoringUser"
  ADD COLUMN IF NOT EXISTS "billingEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionPlan" TEXT NOT NULL DEFAULT 'COURTESY',
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "subscriptionStartedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "subscriptionEndsAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "subscriptionAutoRenew" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "mpPreapprovalId" TEXT,
  ADD COLUMN IF NOT EXISTS "mpPlanId" TEXT,
  ADD COLUMN IF NOT EXISTS "mpStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "mpLastPaymentAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "mpLastPaymentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "MonitoringUser_mpPreapprovalId_key"
  ON "MonitoringUser" ("mpPreapprovalId")
  WHERE "mpPreapprovalId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MonitoringUser_subscriptionPlan_idx" ON "MonitoringUser" ("subscriptionPlan");
CREATE INDEX IF NOT EXISTS "MonitoringUser_subscriptionStatus_idx" ON "MonitoringUser" ("subscriptionStatus");
CREATE INDEX IF NOT EXISTS "MonitoringUser_subscriptionEndsAt_idx" ON "MonitoringUser" ("subscriptionEndsAt");

-- Los usuarios existentes quedan activos como cortesía para no bloquear accesos actuales.
UPDATE "MonitoringUser"
SET "subscriptionPlan"='COURTESY', "subscriptionStatus"='ACTIVE'
WHERE "subscriptionPlan" IS NULL OR "subscriptionStatus" IS NULL;
