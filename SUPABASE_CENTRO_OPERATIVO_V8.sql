-- MEJORAS OPERATIVAS DEL CENTRO DE MONITOREO
-- Ejecutar una sola vez en Supabase > SQL Editor antes de publicar esta versión.

ALTER TABLE "Report"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "assignedToId" INTEGER,
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Report_assignedToId_fkey'
  ) THEN
    ALTER TABLE "Report"
      ADD CONSTRAINT "Report_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "MonitoringUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Report_assignedToId_idx" ON "Report"("assignedToId");
CREATE INDEX IF NOT EXISTS "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "Report_province_district_locality_idx" ON "Report"("province", "district", "locality");

-- Los reportes ya finalizados conservan una fecha de resolución aproximada.
UPDATE "Report"
SET "resolvedAt" = COALESCE("resolvedAt", "updatedAt")
WHERE "status" IN ('resuelta', 'descartada');
