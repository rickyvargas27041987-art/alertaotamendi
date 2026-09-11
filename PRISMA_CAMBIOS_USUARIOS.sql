-- Ejecutar UNA sola vez en Supabase > SQL Editor antes de desplegar esta versión.
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "province" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "locality" TEXT;

CREATE TABLE IF NOT EXISTS "MonitoringUser" (
  "id" SERIAL PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'OPERATOR', "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "lastLoginAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "MonitoringUser_active_idx" ON "MonitoringUser"("active");
CREATE INDEX IF NOT EXISTS "MonitoringUser_role_idx" ON "MonitoringUser"("role");

CREATE TABLE IF NOT EXISTS "UserZone" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "province" TEXT NOT NULL, "district" TEXT NOT NULL, "locality" TEXT,
  CONSTRAINT "UserZone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MonitoringUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "UserZone_userId_idx" ON "UserZone"("userId");
CREATE INDEX IF NOT EXISTS "UserZone_province_district_locality_idx" ON "UserZone"("province","district","locality");

CREATE TABLE IF NOT EXISTS "MonitorSession" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonitorSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MonitoringUser"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MonitorSession_userId_idx" ON "MonitorSession"("userId");
CREATE INDEX IF NOT EXISTS "MonitorSession_expiresAt_idx" ON "MonitorSession"("expiresAt");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY, "userId" INTEGER, "actorName" TEXT NOT NULL, "actorUsername" TEXT NOT NULL, "action" TEXT NOT NULL,
  "details" TEXT, "reportId" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MonitoringUser"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_reportId_idx" ON "AuditLog"("reportId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
