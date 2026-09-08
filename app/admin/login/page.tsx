"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();

      if (!data.success) {
        setError("Contraseña incorrecta o acceso no autorizado.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("No se pudo iniciar sesión. Intentá nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-md rounded-[32px] border border-slate-800 bg-slate-900 p-7 shadow-2xl shadow-black/30 sm:p-9">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500 text-3xl shadow-lg shadow-red-950/40">🚨</div>
        <p className="mt-6 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-red-400">Centro de monitoreo</p>
        <h1 className="mt-2 text-center text-3xl font-black tracking-tight">ALERTA OTAMENDI</h1>
        <p className="mt-2 text-center text-sm text-slate-400">Acceso privado para operadores autorizados.</p>

        <form onSubmit={handleSubmit} className="mt-7">
          <label className="text-sm font-semibold text-slate-300">Contraseña de acceso</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Ingresá tu contraseña"
            autoComplete="current-password"
            required
            autoFocus
            className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-4 text-base outline-none placeholder:text-slate-600 focus:border-red-500"
          />

          {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-center text-sm font-semibold text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 w-full rounded-2xl bg-red-600 py-4 font-black hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Ingresando…" : "Ingresar al centro"}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-800 pt-5 text-center text-xs text-slate-600">Panel privado · Sesión protegida</div>
      </div>
    </main>
  );
}
