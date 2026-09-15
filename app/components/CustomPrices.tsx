"use client";
import { useState } from "react";
import { parsePrice, priceInput, priceLabel } from "@/lib/customPricing";
export default function CustomPrices({ monthly, annual, save, disabled }: {
  monthly: number | null; annual: number | null; disabled: boolean;
  save: (values: { monthlyPrice: string; annualPrice: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [monthlyPrice, setMonthly] = useState("");
  const [annualPrice, setAnnual] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    setError("");
    try {
      parsePrice(monthlyPrice); parsePrice(annualPrice);
      setSaving(true);
      if (await save({ monthlyPrice, annualPrice })) setEditing(false);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }
  return <div className="mt-4 rounded-2xl border border-sky-800/50 bg-sky-950/20 p-3">
    <p className="text-xs font-bold uppercase text-sky-200">Precios personalizados · ARS</p>
    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
      <div><p className="text-xs text-slate-400">Mensual</p><p className="font-bold">{priceLabel(monthly)}</p></div>
      <div><p className="text-xs text-slate-400">Anual · cada 12 meses</p><p className="font-bold">{priceLabel(annual)}</p></div>
    </div>
    <p className="mt-2 text-xs leading-5 text-slate-400">Valores para nuevos enlaces. Guardar no cambia ni cancela una suscripción existente.</p>
    {!editing ? <button type="button" disabled={disabled} onClick={() => {
      setMonthly(priceInput(monthly)); setAnnual(priceInput(annual)); setError(""); setEditing(true);
    }} className="mt-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold disabled:opacity-40">Editar precios</button> :
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-400">Sin separadores de miles. Ej.: 200000 o 200000,50. Vacío = sin asignar.</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">Mensual (ARS)<input aria-label="Precio mensual en pesos" inputMode="decimal" value={monthlyPrice} onChange={e=>setMonthly(e.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2" /></label>
          <label className="text-xs">Anual (ARS)<input aria-label="Precio anual en pesos" inputMode="decimal" value={annualPrice} onChange={e=>setAnnual(e.target.value)} disabled={saving} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-2" /></label>
        </div>
        {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={saving || disabled} onClick={()=>void submit()} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold disabled:opacity-40">{saving ? "Guardando…" : "Guardar precios"}</button>
          <button type="button" disabled={saving} onClick={()=>setEditing(false)} className="rounded-lg border border-slate-600 px-3 py-2 text-xs">Cancelar</button>
        </div>
      </div>}
  </div>;
}
