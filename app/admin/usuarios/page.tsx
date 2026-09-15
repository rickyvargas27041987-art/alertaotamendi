"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import CustomPrices from "@/app/components/CustomPrices";
import { priceLabel } from "@/lib/customPricing";

type Zone = { province: string; district: string; locality: string | null };
type Province = { id: string; nombre: string };
type LocalityOption = { id: string; name: string };
type User = {
  id: number;
  username: string;
  name: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  zones: Zone[];
  billingEmail: string | null;
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionStartedAt: string | null;
  subscriptionEndsAt: string | null;
  subscriptionAutoRenew: boolean;
  mpStatus: string | null;
  mpLastPaymentAt: string | null;
  customMonthlyCents: number | null;
  customAnnualCents: number | null;
  customCheckoutCents: number | null;
  customCheckoutPlan: string | null;
  customCheckoutState: string | null;
  customCheckoutUrl: string | null;
  mpPreapprovalId: string | null;
};

const planLabel: Record<string, string> = {
  COURTESY: "Cortesía",
  TRIAL: "Prueba",
  MONTHLY: "Mensual",
  ANNUAL: "Anual",
};
const statusLabel: Record<string, string> = {
  ACTIVE: "Activa",
  PENDING: "Pendiente",
  PAST_DUE: "Pago pendiente",
  SUSPENDED: "Suspendida",
  CANCELED: "Cancelada",
};
const roleLabel: Record<string, string> = {
  ADMIN: "Administrador",
  OPERATOR: "Operador",
  INSTITUTIONAL: "Consulta institucional",
};

function statusClass(status: string) {
  if (status === "ACTIVE") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
  if (status === "PENDING") return "bg-amber-500/10 text-amber-300 border-amber-500/30";
  return "bg-red-500/10 text-red-300 border-red-500/30";
}

type AccessScope = "DISTRICT" | "LOCALITY";

function UserAccessEditor({
  user,
  provinces,
  disabled,
  save,
}: {
  user: User;
  provinces: Province[];
  disabled: boolean;
  save: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(user.role);
  const [provinceId, setProvinceId] = useState("");
  const [scope, setScope] = useState<AccessScope>(user.zones[0]?.locality ? "LOCALITY" : "DISTRICT");
  const [district, setDistrict] = useState(user.zones[0]?.district ?? "");
  const [locality, setLocality] = useState(user.zones[0]?.locality ?? "");
  const [districts, setDistricts] = useState<string[]>([]);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [localError, setLocalError] = useState("");

  function openEditor() {
    const zone = user.zones[0];
    const matchingProvince = provinces.find((province) => province.nombre === zone?.province);
    setRole(user.role);
    setProvinceId(matchingProvince?.id ?? "");
    setScope(zone?.locality ? "LOCALITY" : "DISTRICT");
    setDistrict(zone?.district ?? "");
    setLocality(zone?.locality ?? "");
    setLocalError("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open || !provinceId) return;
    fetch(`/api/admin/jurisdictions?provinceId=${encodeURIComponent(provinceId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) setDistricts(data.districts ?? []);
        else setLocalError(data.error || "No se pudieron cargar los partidos o departamentos.");
      })
      .catch(() => setLocalError("No se pudieron cargar los partidos o departamentos."));
  }, [open, provinceId]);

  useEffect(() => {
    if (!open || scope !== "LOCALITY" || !provinceId || !district) return;
    fetch(`/api/admin/jurisdictions?provinceId=${encodeURIComponent(provinceId)}&district=${encodeURIComponent(district)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) setLocalities(data.localities ?? []);
        else setLocalError(data.error || "No se pudieron cargar las localidades.");
      })
      .catch(() => setLocalError("No se pudieron cargar las localidades."));
  }, [district, open, provinceId, scope]);

  async function submit() {
    const province = provinces.find((item) => item.id === provinceId)?.nombre ?? "";
    if (!province || !district || (scope === "LOCALITY" && !locality)) {
      setLocalError("Elegí una provincia, el partido/departamento y, si corresponde, la localidad.");
      return;
    }
    setLocalError("");
    const saved = await save({
      role,
      zones: [{ province, district, locality: scope === "LOCALITY" ? locality : null }],
    });
    if (saved) setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={openEditor}
        className="rounded-xl border border-amber-700/70 bg-amber-950/30 px-4 py-2 text-sm font-bold text-amber-200 disabled:opacity-50"
      >
        ✏️ Editar rol y jurisdicción
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-amber-700/60 bg-slate-950/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-black text-amber-200">Editar acceso</p>
          <p className="text-xs text-slate-400">Los cambios se aplicarán en el próximo acceso de esta cuenta.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-sm font-bold text-slate-400">Cerrar</button>
      </div>

      {localError && <div className="mt-3 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{localError}</div>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">Rol
          <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3">
            <option value="OPERATOR">Operador</option>
            <option value="INSTITUTIONAL">Consulta institucional (civil)</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">Provincia
          <select
            value={provinceId}
            onChange={(event) => { setProvinceId(event.target.value); setDistrict(""); setLocality(""); }}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
          >
            <option value="">Seleccionar provincia</option>
            {provinces.map((province) => <option key={province.id} value={province.id}>{province.nombre}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-300">Alcance territorial
          <select
            value={scope}
            onChange={(event) => { const value = event.target.value as AccessScope; setScope(value); if (value === "DISTRICT") setLocality(""); }}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
          >
            <option value="DISTRICT">Partido / departamento completo</option>
            <option value="LOCALITY">Una localidad específica</option>
          </select>
        </label>
        <label className="text-sm text-slate-300">Partido / departamento
          <select
            value={district}
            onChange={(event) => { setDistrict(event.target.value); setLocality(""); }}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
            disabled={!provinceId}
          >
            <option value="">Seleccionar</option>
            {districts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {scope === "LOCALITY" && <label className="text-sm text-slate-300 sm:col-span-2">Localidad
          <select value={locality} onChange={(event) => setLocality(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" disabled={!district}>
            <option value="">Seleccionar localidad</option>
            {localities.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
          </select>
        </label>}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-bold text-slate-300">Cancelar</button>
        <button type="button" disabled={disabled} onClick={submit} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">Guardar acceso</button>
      </div>
    </div>
  );
}

export default function UsuariosPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [checkoutLink, setCheckoutLink] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [localities, setLocalities] = useState<LocalityOption[]>([]);
  const [provinceId, setProvinceId] = useState("06");
  const [scope, setScope] = useState<"DISTRICT" | "LOCALITY">("DISTRICT");
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    role: "OPERATOR",
    province: "Buenos Aires",
    district: "",
    locality: "",
    billingEmail: "",
    subscriptionPlan: "COURTESY",
  });

  async function load() {
    const me = await fetch("/api/admin/me", { cache: "no-store" });
    if (!me.ok) {
      router.push("/admin/login");
      return;
    }
    const md = await me.json();
    if (md.user?.role !== "ADMIN") {
      router.push("/admin");
      return;
    }
    const r = await fetch("/api/admin/users", { cache: "no-store" });
    const d = await r.json();
    if (d.success) setUsers(d.users);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    fetch("/api/admin/jurisdictions", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (data.success) setProvinces(data.provinces ?? []); })
      .catch(() => setError("No se pudo cargar el listado de provincias."));
  }, []);

  useEffect(() => {
    if (!provinceId) return;
    fetch(`/api/admin/jurisdictions?provinceId=${encodeURIComponent(provinceId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) return;
        setDistricts(data.districts ?? []);
        setForm((current) => ({ ...current, province: data.province.nombre, district: "", locality: "" }));
      })
      .catch(() => setError("No se pudo cargar el listado de partidos o departamentos."));
  }, [provinceId]);

  useEffect(() => {
    if (scope !== "LOCALITY" || !form.district) {
      setLocalities([]);
      setForm((current) => current.locality ? { ...current, locality: "" } : current);
      return;
    }
    fetch(`/api/admin/jurisdictions?provinceId=${encodeURIComponent(provinceId)}&district=${encodeURIComponent(form.district)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => { if (data.success) setLocalities(data.localities ?? []); })
      .catch(() => setError("No se pudo cargar el listado de localidades."));
  }, [form.district, provinceId, scope]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.district || (scope === "LOCALITY" && !form.locality)) {
      setError("Elegí el partido/departamento y, si corresponde, la localidad.");
      return;
    }
    const zones = [{ province: form.province, district: form.district, locality: scope === "LOCALITY" ? form.locality : null }];
    const r = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, zones }),
    });
    const d = await r.json();
    if (!d.success) {
      setError(d.error || "Error");
      return;
    }
    setForm({ ...form, username: "", name: "", password: "", district: "", locality: "", billingEmail: "" });
    load();
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusyId(id);
    setError("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error || "No se pudo actualizar."); return false; }
      await load();
      return true;
    } catch {
      setError("Error de conexión. Actualizá para comprobar si el cambio se guardó.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function createCheckout(u: User, plan: "MONTHLY" | "ANNUAL") {
    const cents = plan === "MONTHLY" ? u.customMonthlyCents : u.customAnnualCents;
    if (cents === null) { setError("Primero asigná y guardá el importe."); return; }
    if (!window.confirm(`¿Generar enlace para ${u.name} por ${priceLabel(cents)} ${plan === "MONTHLY" ? "cada mes" : "cada 12 meses"}? El cliente deberá autorizar el cobro recurrente en Mercado Pago.`)) return;
    setCheckoutLink("");
    setBusyId(u.id);
    setError("");
    try {
      const r = await fetch("/api/admin/subscriptions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: u.id, plan, confirmedCents: cents }),
      });
      const d = await r.json();
      if (!d.success) {
        setError(d.error || "No se pudo generar el enlace de Mercado Pago.");
        return;
      }
      if (d.checkoutUrl) setCheckoutLink(d.checkoutUrl);
      else setError("Mercado Pago creó la suscripción, pero no devolvió un enlace de pago.");
      await load();
    } catch {
      setError("No se pudo confirmar el resultado. Actualizá antes de intentar otro cobro.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const active = users.filter((u) => u.subscriptionStatus === "ACTIVE").length;
    const pending = users.filter((u) => u.subscriptionStatus !== "ACTIVE").length;
    return { total: users.length, active, pending };
  }, [users]);

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-red-400">Administración</p>
            <h1 className="text-3xl font-black">Usuarios del Centro</h1>
            <p className="mt-1 text-sm text-slate-400">Permisos, jurisdicciones y suscripciones.</p>
          </div>
          <div className="flex gap-2">
            <a href="/admin/auditoria" className="rounded-xl border border-slate-700 px-4 py-2">📋 Auditoría</a>
            <button onClick={() => router.push("/admin")} className="rounded-xl border border-slate-700 px-4 py-2">← Monitoreo</button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><p className="text-xs text-slate-500">Usuarios</p><p className="text-2xl font-black">{counts.total}</p></div>
          <div className="rounded-2xl border border-emerald-900/50 bg-slate-900 p-4"><p className="text-xs text-slate-500">Suscripciones activas</p><p className="text-2xl font-black text-emerald-300">{counts.active}</p></div>
          <div className="rounded-2xl border border-amber-900/50 bg-slate-900 p-4"><p className="text-xs text-slate-500">Pendientes / suspendidas</p><p className="text-2xl font-black text-amber-300">{counts.pending}</p></div>
        </div>

        {error && <div className="mt-4 rounded-2xl border border-red-800 bg-red-950/40 p-4 text-sm font-semibold text-red-200">{error}</div>}

        {checkoutLink && <div className="mt-4 rounded-2xl border border-sky-800 bg-sky-950/40 p-4 text-sm">
          Enlace listo. No se realizó un pago desde esta pantalla.
          <a href={checkoutLink} target="_blank" rel="noopener noreferrer" className="ml-2 font-bold text-sky-200 underline">Abrir Mercado Pago</a>
        </div>}
        <div className="mt-6 grid gap-6 xl:grid-cols-[390px_1fr]">
          <form onSubmit={create} className="h-fit rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-xl font-black">Crear usuario</h2>
            {[
              ["name", "Nombre"],
              ["username", "Usuario"],
              ["password", "Contraseña (mín. 8)"],
              ["billingEmail", "Email de facturación"],
            ].map(([k, l]) => (
              <label key={k} className="mt-4 block text-sm text-slate-300">
                {l}
                <input
                  type={k === "password" ? "password" : k === "billingEmail" ? "email" : "text"}
                  value={(form as any)[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3"
                  required={["name", "username", "password"].includes(k)}
                />
              </label>
            ))}
            <label className="mt-4 block text-sm text-slate-300">Provincia
              <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" required>
                <option value="">Seleccionar provincia</option>
                {provinces.map((province) => <option key={province.id} value={province.id}>{province.nombre}</option>)}
              </select>
            </label>
            <label className="mt-4 block text-sm text-slate-300">Alcance territorial
              <select value={scope} onChange={(e) => setScope(e.target.value as "DISTRICT" | "LOCALITY")} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3">
                <option value="DISTRICT">Partido / departamento completo</option>
                <option value="LOCALITY">Una localidad específica</option>
              </select>
            </label>
            <label className="mt-4 block text-sm text-slate-300">{form.province === "Buenos Aires" ? "Partido" : "Departamento / municipio"}
              <select value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value, locality: "" })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" required>
                <option value="">Seleccionar</option>
                {districts.map((district) => <option key={district} value={district}>{district}</option>)}
              </select>
            </label>
            {scope === "LOCALITY" && <label className="mt-4 block text-sm text-slate-300">Localidad
              <select value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" required disabled={!form.district}>
                <option value="">Seleccionar localidad</option>
                {localities.map((locality) => <option key={locality.id} value={locality.name}>{locality.name}</option>)}
              </select>
            </label>}
            <label className="mt-4 block text-sm">Rol
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3">
                <option value="OPERATOR">Operador</option>
                <option value="INSTITUTIONAL">Consulta institucional (civil)</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </label>
            <label className="mt-4 block text-sm">Plan inicial
              <select value={form.subscriptionPlan} onChange={(e) => setForm({ ...form, subscriptionPlan: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-3">
                <option value="COURTESY">Cortesía</option>
                <option value="TRIAL">Prueba 15 días</option>
                <option value="MONTHLY">Mensual · pendiente de pago</option>
                <option value="ANNUAL">Anual · pendiente de pago</option>
              </select>
            </label>
            <button className="mt-5 w-full rounded-xl bg-red-600 p-3 font-black">Crear usuario</button>
            <p className="mt-3 text-xs leading-5 text-slate-500">“Partido completo” incluye todas sus localidades. El perfil institucional solo recibe mapa aproximado, actividad y estadísticas: no recibe direcciones exactas, descripción, evidencia, responsables ni controles operativos.</p>
          </form>

          <section className="space-y-4">
            {users.map((u) => (
              <article key={u.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-[250px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black">{u.name}</h3>
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-xs">{roleLabel[u.role] || u.role}</span>
                      <span className={u.active ? "text-emerald-400" : "text-red-400"}>{u.active ? "● Cuenta activa" : "● Cuenta suspendida"}</span>
                    </div>
                    <p className="text-sm text-slate-400">@{u.username}</p>
                    <div className="mt-2 text-sm text-slate-300">
                      {u.zones.length ? u.zones.map((z, i) => <div key={i}>📍 {z.locality ? `${z.locality} · ` : `Todo ${z.district} · `}{z.locality ? z.district : ""}{z.locality ? " · " : ""}{z.province}</div>) : <div>🌐 Sin zonas asignadas</div>}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Último acceso: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-AR") : "Nunca"}</p>
                  </div>

                  <div className="w-full rounded-2xl border border-slate-700 bg-slate-950/70 p-4 lg:w-[430px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Suscripción</p>
                        <p className="font-black">{planLabel[u.subscriptionPlan] || u.subscriptionPlan}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass(u.subscriptionStatus)}`}>{statusLabel[u.subscriptionStatus] || u.subscriptionStatus}</span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                      <div>📧 {u.billingEmail || "Sin email de facturación"}</div>
                      <div>🔁 {u.subscriptionAutoRenew ? "Renovación automática" : "Renovación manual"}</div>
                      <div>📅 Vence: {u.subscriptionEndsAt ? new Date(u.subscriptionEndsAt).toLocaleDateString("es-AR") : "Sin vencimiento"}</div>
                      <div>💳 Mercado Pago: {u.mpStatus || "No vinculado"}</div>
                    </div>

                    {u.role !== "ADMIN" && <CustomPrices monthly={u.customMonthlyCents} annual={u.customAnnualCents} disabled={busyId === u.id} save={values => patch(u.id, values)} />}
                    {u.customCheckoutCents !== null && <p className="mt-3 text-xs text-slate-400">Importe del último enlace solicitado: {priceLabel(u.customCheckoutCents)} · {u.customCheckoutPlan === "ANNUAL" ? "anual" : "mensual"}. No confirma un pago.</p>}
                    {u.mpPreapprovalId && <p className="mt-2 text-xs text-amber-200">Contrato ya vinculado. Su importe vigente debe consultarse en Mercado Pago; editar estos precios no lo modifica.</p>}
                    {u.customCheckoutState && !u.mpPreapprovalId && <p role="alert" className="mt-2 text-xs text-amber-200">Solicitud en proceso o pendiente de revisión. Verificá Mercado Pago antes de generar otra.</p>}
                    {u.mpStatus === "pending" && u.customCheckoutUrl && <a href={u.customCheckoutUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-sky-200 underline">Abrir enlace pendiente existente</a>}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button disabled={busyId === u.id} onClick={() => { const email = window.prompt("Email de facturación", u.billingEmail || ""); if (email !== null) patch(u.id, { billingEmail: email }); }} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-200">✉️ Email</button>
                      <button disabled={busyId === u.id} onClick={() => patch(u.id, { subscriptionAction: "TRIAL_15" })} className="rounded-lg border border-sky-800 bg-sky-950/40 px-3 py-2 text-xs font-bold text-sky-200">15 días prueba</button>
                      <button disabled={busyId === u.id} onClick={() => patch(u.id, { subscriptionAction: "EXTEND_30" })} className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200">+30 días</button>
                      <button disabled={busyId === u.id} onClick={() => patch(u.id, { subscriptionAction: "EXTEND_365" })} className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-200">+1 año</button>
                      <button disabled={busyId === u.id} onClick={() => patch(u.id, { subscriptionAction: "COURTESY" })} className="rounded-lg border border-violet-800 bg-violet-950/40 px-3 py-2 text-xs font-bold text-violet-200">Cortesía</button>
                    </div>

                    {u.role !== "ADMIN" && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-3">
                        <button disabled={busyId === u.id || !u.billingEmail || !u.active || u.customMonthlyCents === null || !!u.mpPreapprovalId || !!u.customCheckoutState} onClick={() => createCheckout(u, "MONTHLY")} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-black disabled:opacity-40">💳 Cobrar mensual</button>
                        <button disabled={busyId === u.id || !u.billingEmail || !u.active || u.customAnnualCents === null || !!u.mpPreapprovalId || !!u.customCheckoutState} onClick={() => createCheckout(u, "ANNUAL")} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black disabled:opacity-40">💳 Cobrar anual</button>
                        <button disabled={busyId === u.id} onClick={() => patch(u.id, { subscriptionAction: u.subscriptionStatus === "SUSPENDED" ? "REACTIVATE" : "SUSPEND_SUBSCRIPTION" })} className="rounded-lg border border-red-800 px-3 py-2 text-xs font-bold text-red-300">{u.subscriptionStatus === "SUSPENDED" ? "Reactivar" : "Suspender suscripción"}</button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <div className="flex flex-wrap justify-end gap-2">
                    <UserAccessEditor user={u} provinces={provinces} disabled={busyId === u.id} save={(body) => patch(u.id, body)} />
                    <button disabled={busyId === u.id} onClick={() => patch(u.id, { active: !u.active })} className={`rounded-xl px-4 py-2 text-sm font-bold ${u.active ? "bg-red-950 text-red-300" : "bg-emerald-950 text-emerald-300"}`}>{u.active ? "Suspender cuenta" : "Activar cuenta"}</button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}
