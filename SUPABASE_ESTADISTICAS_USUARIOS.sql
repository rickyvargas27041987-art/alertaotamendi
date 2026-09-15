-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Registra instalaciones anónimas para las estadísticas exclusivas del ADMIN.

CREATE TABLE IF NOT EXISTS "AppInstallation" (
  "id" SERIAL PRIMARY KEY,
  "installationId" TEXT NOT NULL UNIQUE,
  "platform" TEXT,
  "province" TEXT,
  "district" TEXT,
  "locality" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AppInstallation_province_district_locality_idx"
  ON "AppInstallation" ("province", "district", "locality");

CREATE INDEX IF NOT EXISTS "AppInstallation_createdAt_idx"
  ON "AppInstallation" ("createdAt");

CREATE INDEX IF NOT EXISTS "AppInstallation_lastSeenAt_idx"
  ON "AppInstallation" ("lastSeenAt");

-- Estas columnas ya pueden existir si se agregó el schema anterior.
ALTER TABLE "PushSubscription"
  ADD COLUMN IF NOT EXISTS "province" TEXT,
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "locality" TEXT;

ALTER TABLE "FcmDevice"
  ADD COLUMN IF NOT EXISTS "province" TEXT,
  ADD COLUMN IF NOT EXISTS "district" TEXT,
  ADD COLUMN IF NOT EXISTS "locality" TEXT;

CREATE INDEX IF NOT EXISTS "PushSubscription_province_district_locality_idx"
  ON "PushSubscription" ("province", "district", "locality");

CREATE INDEX IF NOT EXISTS "FcmDevice_province_district_locality_idx"
  ON "FcmDevice" ("province", "district", "locality");
