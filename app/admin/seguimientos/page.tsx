"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Zone = { province: string; district: string; locality: string | null };
type CurrentUser = { role: string; name: string; organizationType?: string; zones: Zone[] };
type TrackingTarget = {
  id: number; type: "PERSON" | "VEHICLE"; title: string; reason: string;
  description: string | null; imageUrl: string | null; province: string | null;
  district: string | null; locality: string | null; active: boolean; createdByName: string;
  personAge: string | null; personFeatures: string | null; vehiclePlate: string | null;
  vehicleMake: string | null; vehicleModel: string | null; vehicleColor: string | null;
  vehicleType: string | null; distinctive: string | null; closedAt: string | null;
  createdAt: string; updatedAt: string;
};

const emptyForm = {
  type: "PERSON" as "PERSON" | "VEHICLE", title: "", reason: "", description: "",
  province: "", district: "", locality: "", personAge: "", personFeatures: "",
  vehiclePlate: "", vehicleMake: "", vehicleModel: "", vehicleColor: "", vehicleType: "", distinctive: "",
};

async function uploadPhoto(file: File) {
  const authorization = await fetch("/api/media/upload-url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder: "fotos", fileName: file.name, contentType: file.type, size: file.size }),
  });
  const permission = await authorization.json().catch(() => null);
  if (!authorization.ok || !permission?.success) throw new Error(permission?.error || "No se pudo autorizar la foto.");
  const { error } = await supabase.storage.from("alertas").uploadToSignedUrl(permission.path, permission.token, file, { contentType: file.type || undefined });
  if (error) throw error;
  return String(permission.publicUrl);
}

export default function SeguimientosPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [targets, setTargets] = useState<TrackingTarget[]>([]);
  const [tab, setTab] = useState<"PERSON" | "VEHICLE">("PERSON");
  const [showFinished, setShowFinished] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const meResponse = await fetch("/api/admin/me", { cache: "no-store" });
      const me = await meResponse.json();
      if (!meResponse.ok || !me.success) { router.push("/admin/login"); return; }
      if (me.user?.role === "INSTITUTIONAL") { router.push("/admin"); return; }
      setCurrentUser(me.user);
      const firstZone = Array.isArray(me.user?.zones) ? me.user.zones[0] : null;
      if (firstZone) setForm((current) => ({ ...current, province: current.province || firstZone.province || "", district: current.district || firstZone.district || "", locality: current.locality || firstZone.locality || "" }));
      const response = await fetch("/api/admin/tracking-targets", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) { setError(data.error || "No se pudieron cargar los seguimientos."); return; }
      setTargets(Array.isArray(data.targets) ? data.targets : []);
    } catch { setError("No se pudo conectar con el Centro de Monitoreo."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photo); setPhotoPreview(url); return () => URL.revokeObjectURL(url);
  }, [photo]);

  const visibleTargets = useMemo(() => targets.filter((t) => t.type === tab && (showFinished ? !t.active : t.active)), [targets, tab, showFinished]);
  const activePeople = targets.filter((t) => t.type === "PERSON" && t.active).length;
  const activeVehicles = targets.filter((t) => t.type === "VEHICLE" && t.active).length;

  function switchType(type: "PERSON" | "VEHICLE") { setTab(type); setForm((c) => ({ ...c, type })); setError(""); setMessage(""); }

  async function createTarget(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (form.title.trim().length < 2) { setError(tab === "PERSON" ? "Ingresá un nombre o una referencia." : "Ingresá una patente o referencia."); return; }
    if (form.reason.trim().length < 2) { setError("Indicá brevemente el motivo del seguimiento."); return; }
    if (!form.province.trim() || !form.district.trim()) { setError("Falta la provincia o el partido/departamento."); return; }
    if (photo && photo.size > 10 * 1024 * 1024) { setError("La foto no puede superar los 10 MB."); return; }
    setSaving(true);
    try {
      const imageUrl = photo ? await uploadPhoto(photo) : null;
      const response = await fetch("/api/admin/tracking-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, type: tab, imageUrl }) });
      const data = await response.json();
      if (!response.ok || !data.success) { setError(data.error || "No se pudo crear el seguimiento."); return; }
      const zone = currentUser?.zones?.[0];
      setForm({ ...emptyForm, type: tab, province: zone?.province || form.province, district: zone?.district || form.district, locality: zone?.locality || "" });
      setPhoto(null); setMessage("✅ Seguimiento creado."); await load();
    } catch (cause) { console.error(cause); setError("No se pudo guardar el seguimiento."); }
    finally { setSaving(false); }
  }

  async function changeActive(target: TrackingTarget, active: boolean) {
    if (!window.confirm(active ? "¿Querés reactivar este seguimiento?" : "¿Querés finalizar este seguimiento?")) return;
    setBusyId(target.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/tracking-targets", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target.id, active }) });
      const data = await response.json();
      if (!response.ok || !data.success) { setError(data.error || "No se pudo actualizar."); return; }
      setMessage(active ? "✅ Seguimiento reactivado." : "✅ Seguimiento finalizado."); await load();
    } catch { setError("No se pudo actualizar el seguimiento."); }
    finally { setBusyId(null); }
  }

  const fixedZone = currentUser?.role !== "ADMIN" && currentUser?.zones?.[0];

  return <main className="min-h-screen bg-slate-950 p-4 text-white sm:p-6"><div className="mx-auto max-w-7xl">
    <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 md:flex-row md:items-center md:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-400">Centro de Monitoreo</p><h1 className="mt-1 text-3xl font-black">🎯 Seguimientos</h1><p className="mt-2 text-sm text-slate-400">Personas y vehículos que el Centro debe tener presentes ante nuevos reportes.</p></div>
      <button type="button" onClick={() => router.push("/admin")} className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold hover:bg-slate-800">← Volver al monitoreo</button>
    </header>

    <section className="mt-4 grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => switchType("PERSON")} className={`rounded-3xl border p-5 text-left transition ${tab === "PERSON" ? "border-orange-500/60 bg-orange-950/30" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}><p className="text-2xl">👤</p><p className="mt-2 text-lg font-black">Personas</p><p className="mt-1 text-sm text-slate-400">{activePeople} seguimiento(s) activo(s)</p></button>
      <button type="button" onClick={() => switchType("VEHICLE")} className={`rounded-3xl border p-5 text-left transition ${tab === "VEHICLE" ? "border-cyan-500/60 bg-cyan-950/30" : "border-slate-800 bg-slate-900 hover:border-slate-600"}`}><p className="text-2xl">🚗</p><p className="mt-2 text-lg font-black">Vehículos</p><p className="mt-1 text-sm text-slate-400">{activeVehicles} seguimiento(s) activo(s)</p></button>
    </section>

    {(error || message) && <div className={`mt-4 rounded-2xl border p-4 text-sm font-semibold ${error ? "border-red-800 bg-red-950/40 text-red-200" : "border-emerald-800 bg-emerald-950/30 text-emerald-200"}`}>{error || message}</div>}

    <div className="mt-4 grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <form onSubmit={createTarget} className="h-fit rounded-3xl border border-slate-800 bg-slate-900 p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Nuevo seguimiento</p><h2 className="mt-1 text-xl font-black">{tab === "PERSON" ? "👤 Persona" : "🚗 Vehículo"}</h2>
        <label className="mt-5 block text-sm font-semibold text-slate-300">{tab === "PERSON" ? "Nombre o referencia" : "Patente o referencia"}<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={tab === "PERSON" ? "Ej: Juan Pérez / persona perdida" : "Ej: AB123CD / Ford gris"} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-500" required /></label>
        <label className="mt-4 block text-sm font-semibold text-slate-300">Motivo<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ej: búsqueda de paradero" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 outline-none focus:border-cyan-500" required /></label>
        {tab === "PERSON" ? <><label className="mt-4 block text-sm text-slate-300">Edad aproximada <span className="text-slate-600">(opcional)</span><input value={form.personAge} onChange={(e) => setForm({ ...form, personAge: e.target.value })} placeholder="Ej: 35 años" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label><label className="mt-4 block text-sm text-slate-300">Rasgos importantes <span className="text-slate-600">(opcional)</span><input value={form.personFeatures} onChange={(e) => setForm({ ...form, personFeatures: e.target.value })} placeholder="Ropa, altura, tatuajes, etc." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label></> : <div className="mt-4 grid grid-cols-2 gap-2">{[["vehiclePlate","Patente"],["vehicleType","Tipo"],["vehicleMake","Marca"],["vehicleModel","Modelo"],["vehicleColor","Color"],["distinctive","Rasgo distintivo"]].map(([key,label]) => <label key={key} className="text-sm text-slate-300">{label}<input value={(form as Record<string,string>)[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5" /></label>)}</div>}
        <label className="mt-4 block text-sm text-slate-300">Descripción breve <span className="text-slate-600">(opcional)</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Información que ayude al operador a reconocerlo." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3" /></label>
        <label className="mt-4 block text-sm text-slate-300">Foto de referencia <span className="text-slate-600">(opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="mt-2 block w-full text-xs text-slate-400" /></label>
        {photoPreview && <img src={photoPreview} alt="Vista previa" className="mt-3 h-44 w-full rounded-2xl border border-slate-700 object-cover" />}
        {fixedZone ? <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400"><p className="font-bold text-slate-300">📍 Jurisdicción automática</p><p className="mt-1">{fixedZone.locality ? `${fixedZone.locality} · ` : ""}{fixedZone.district} · {fixedZone.province}</p></div> : <div className="mt-4 grid gap-2"><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Jurisdicción</p><input value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} placeholder="Provincia" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" /><input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="Partido / departamento" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" /><input value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} placeholder="Localidad (opcional)" className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm" /></div>}
        <button type="submit" disabled={saving} className="mt-5 w-full rounded-2xl bg-cyan-600 py-3.5 font-black hover:bg-cyan-500 disabled:opacity-50">{saving ? "Guardando…" : "🎯 Crear seguimiento"}</button>
      </form>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">{tab === "PERSON" ? "Personas" : "Vehículos"}</p><h2 className="mt-1 text-xl font-black">{showFinished ? "Seguimientos finalizados" : "Seguimientos activos"}</h2></div><button type="button" onClick={() => setShowFinished((v) => !v)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold">{showFinished ? "Ver activos" : "Ver finalizados"}</button></div>
        {loading ? <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-slate-500">Cargando…</div> : visibleTargets.length === 0 ? <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-8 text-center text-slate-500">No hay seguimientos en esta sección.</div> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{visibleTargets.map((target) => <article key={target.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4"><div className="flex gap-3">{target.imageUrl ? <img src={target.imageUrl} alt={target.title} className="h-24 w-24 shrink-0 rounded-2xl border border-slate-700 object-cover" /> : <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 text-3xl">{target.type === "PERSON" ? "👤" : "🚗"}</div>}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h3 className="break-words font-black">{target.title}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${target.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{target.active ? "ACTIVO" : "FINALIZADO"}</span></div><p className="mt-1 text-xs font-semibold text-amber-300">{target.reason}</p><p className="mt-2 text-xs text-slate-500">📍 {target.locality ? `${target.locality} · ` : ""}{target.district || "Sin partido"} · {target.province || "Sin provincia"}</p></div></div>{target.type === "PERSON" ? <div className="mt-3 space-y-1 text-xs text-slate-400">{target.personAge && <p><span className="text-slate-600">Edad:</span> {target.personAge}</p>}{target.personFeatures && <p><span className="text-slate-600">Rasgos:</span> {target.personFeatures}</p>}</div> : <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-400">{target.vehiclePlate && <p><span className="text-slate-600">Patente:</span> {target.vehiclePlate}</p>}{target.vehicleType && <p><span className="text-slate-600">Tipo:</span> {target.vehicleType}</p>}{target.vehicleMake && <p><span className="text-slate-600">Marca:</span> {target.vehicleMake}</p>}{target.vehicleModel && <p><span className="text-slate-600">Modelo:</span> {target.vehicleModel}</p>}{target.vehicleColor && <p><span className="text-slate-600">Color:</span> {target.vehicleColor}</p>}{target.distinctive && <p className="col-span-2"><span className="text-slate-600">Rasgo:</span> {target.distinctive}</p>}</div>}{target.description && <p className="mt-3 rounded-xl bg-slate-900 p-3 text-xs leading-5 text-slate-300">{target.description}</p>}<div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800 pt-3"><p className="text-[10px] text-slate-600">Cargado por {target.createdByName}</p><button type="button" disabled={busyId === target.id} onClick={() => void changeActive(target, !target.active)} className={`rounded-xl px-3 py-2 text-xs font-black disabled:opacity-50 ${target.active ? "border border-red-800 bg-red-950/30 text-red-300" : "border border-emerald-800 bg-emerald-950/30 text-emerald-300"}`}>{target.active ? "Finalizar" : "Reactivar"}</button></div></article>)}</div>}
      </section>
    </div>
  </div></main>;
}
