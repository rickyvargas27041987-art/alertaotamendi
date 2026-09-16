import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("el envío de alertas responde antes del trabajo secundario", async () => {
  const code = await source("app/api/reports/route.ts");
  assert.match(code, /after\(async \(\) =>/);
  assert.match(code, /status:\s*201/);
});

test("el API público limita alertas a dos horas y oculta las cerradas", async () => {
  const code = await source("app/api/reports/route.ts");
  assert.match(code, /2 \* 60 \* 60 \* 1000/);
  assert.match(code, /notIn: \["resuelta", "descartada"\]/);
});

test("Android tiene envío y desactivación FCM", async () => {
  const reports = await source("app/api/reports/route.ts");
  const unsubscribe = await source("app/api/fcm/unsubscribe/route.ts");
  assert.match(reports, /sendFcmNotification/);
  assert.match(unsubscribe, /enabled: false/);
});

test("los patrones preventivos comprueban la jurisdicción", async () => {
  const code = await source("app/api/person-pattern-alerts/route.ts");
  assert.match(code, /canViewReport/);
  assert.match(code, /canOperateReport/);
});

test("las nuevas cuentas no pueden crearse como superadministrador", async () => {
  const code = await source("app/api/admin/users/route.ts");
  assert.match(code, /\["CENTER_ADMIN", "OPERATOR", "INSTITUTIONAL"\]/);
});
