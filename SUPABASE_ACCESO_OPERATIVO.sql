-- ACCESO OPERATIVO SEGURO
-- Ejecutar una sola vez en Supabase > SQL Editor antes de publicar esta versión.

CREATE TABLE IF NOT EXISTS "OperationalCodeConfig" (
  "id" SERIAL PRIMARY KEY,
  "centerKey" TEXT NOT NULL UNIQUE,
  "ownerUserId" INTEGER UNIQUE,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "rotationStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalCodeConfig_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "MonitoringUser"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OperationalSession" (
  "id" SERIAL PRIMARY KEY,
  "configId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "officerName" TEXT NOT NULL,
  "agency" TEXT NOT NULL,
  "serviceType" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastAccessAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalSession_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "OperationalCodeConfig"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OperationalAuditLog" (
  "id" SERIAL PRIMARY KEY,
  "configId" INTEGER NOT NULL,
  "sessionId" INTEGER,
  "actorName" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "details" TEXT,
  "reportId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalAuditLog_configId_fkey"
    FOREIGN KEY ("configId") REFERENCES "OperationalCodeConfig"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OperationalAuditLog_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "OperationalSession"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OperationalCodeConfig_updatedAt_idx" ON "OperationalCodeConfig"("updatedAt");
CREATE INDEX IF NOT EXISTS "OperationalSession_configId_expiresAt_idx" ON "OperationalSession"("configId", "expiresAt");
CREATE INDEX IF NOT EXISTS "OperationalSession_revokedAt_idx" ON "OperationalSession"("revokedAt");
CREATE INDEX IF NOT EXISTS "OperationalAuditLog_configId_createdAt_idx" ON "OperationalAuditLog"("configId", "createdAt");
CREATE INDEX IF NOT EXISTS "OperationalAuditLog_sessionId_idx" ON "OperationalAuditLog"("sessionId");
CREATE INDEX IF NOT EXISTS "OperationalAuditLog_reportId_idx" ON "OperationalAuditLog"("reportId");
