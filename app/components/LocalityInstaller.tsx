"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Province = { id: string; nombre: string };
type Locality = { id: string; name: string; district: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function LocalityInstaller() {
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [province, setProvince] = useState("");
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [locality, setLocality] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/installation-localities").then((r) => r.json()).then((d) => setProvinces(d.provinces ?? [])).catch(() => setError("No se pudieron cargar las provincias."));
  }, []);

  useEffect(() => {
    if (!province) { setLocalities([]); return; }
    const controller = new AbortController();
    setLoading(true); setError(""); setLocality(""); setSearch("");
    fetch(`/api/installation-localities?province=${encodeURIComponent(province)}`, { signal: controller.signal })
      .then((r) => r.json()).then((d) => { if (d.success) setLocalities(d.localities ?? []); else setError(d.error); })
      .catch((err) => { if (err.name !== "AbortError") setError("No se pudieron cargar las localidades."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [province]);

  const filtered = useMemo(() => {
    const term = normalize(search.trim());
    if (!term) return localities;
    return localities.filter((item) => normalize(`${item.name} ${item.district}`).includes(term));
  }, [localities, search]);

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-md">
      <Link href="/" className="text-sm font-bold text-slate-400">← Volver</Link>
      <div className="mt-5 rounded-[32px] border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600 text-3xl">🚨</div>
        <p className="mt-5 text-center text-xs font-black uppercase tracking-[0.2em] text-red-400">Instalación personalizada</p>
        <h1 className="mt-2 text-center text-3xl font-black">Tu localidad, tu ícono</h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-400">Elegí dónde vivís para instalarla como “Alerta Balcarce”, “Alerta Miramar” o el nombre correspondiente. Dentro seguirá funcionando Alerta Otamendi.</p>

        <label className="mt-6 block text-sm font-bold">Provincia
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3">
            <option value="">Seleccionar provincia</option>
            {provinces.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
        </label>
        <label className="mt-4 block text-sm font-bold">Buscar localidad
          <input value={search} onChange={(e) => { setSearch(e.target.value); setLocality(""); }} disabled={!province || loading} placeholder="Ej.: Balcarce" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 disabled:opacity-50" />
        </label>
        <label className="mt-4 block text-sm font-bold">Localidad
          <select value={locality} onChange={(e) => setLocality(e.target.value)} disabled={!province || loading} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 disabled:opacity-50">
            <option value="">{loading ? "Cargando…" : "Seleccionar localidad"}</option>
            {filtered.map((item) => <option key={item.id} value={item.id}>{item.name}{item.district ? ` · ${item.district}` : ""}</option>)}
          </select>
        </label>
        {error && <p className="mt-4 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
        {locality && <a href={`/instalar/${locality}`} className="mt-5 block w-full rounded-2xl bg-red-600 p-4 text-center font-black hover:bg-red-500">Ver ícono y preparar instalación</a>}
        <p className="mt-5 text-xs leading-5 text-amber-200/80">Si ya tenés una versión instalada, el celular puede conservar el nombre anterior. Revisá tus reportes y notificaciones antes de eliminarla.</p>
      </div>
    </div>
  </main>;
}
