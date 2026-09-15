"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallationLanding({ id, name, province, launch, children }: { id: string; name: string; province: string; launch: boolean; children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const isStandalone = standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (isStandalone) window.setTimeout(() => setInstalled(true), 0);
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const appInstalled = () => { setPrompt(null); setInstalled(true); };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setBusy(true); setMessage("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(choice.outcome === "accepted" ? "Instalación aceptada. El celular terminará el proceso." : "La instalación fue cancelada.");
      setPrompt(null);
    } catch {
      setMessage("No se pudo abrir la instalación automática. Usá el menú del navegador.");
    } finally { setBusy(false); }
  }

  if (launch || installed) return children;

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">
    <div className="mx-auto max-w-md">
      <Link href="/instalar" className="text-sm font-bold text-slate-400">← Elegir otra localidad</Link>
      <div className="mt-5 rounded-[32px] border border-red-900/60 bg-slate-900 p-6 text-center shadow-2xl">
        {/* La imagen proviene de una ruta dinámica y es el ícono real que usará la instalación. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/instalar/${id}/icono?size=192`} width={128} height={128} alt={`Ícono ${name}`} className="mx-auto rounded-[30px] shadow-xl" />
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-red-400">Lista para instalar</p>
        <h1 className="mt-2 text-3xl font-black">{name}</h1>
        <p className="mt-1 text-sm text-slate-400">{province}</p>
        <p className="mt-4 text-sm leading-6 text-slate-300">Este nombre aparecerá debajo del ícono del celular. Al abrirla, ingresarás a la aplicación habitual de Alerta Otamendi.</p>
        {prompt && <button type="button" onClick={() => void install()} disabled={busy} className="mt-5 w-full rounded-2xl bg-red-600 p-4 font-black hover:bg-red-500 disabled:opacity-50">{busy ? "Preparando…" : `Instalar ${name}`}</button>}
        {!prompt && <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950 p-4 text-left text-sm leading-6 text-slate-300">
          <p className="font-black text-white">Instalación manual</p>
          <p className="mt-2"><b>Android:</b> abrí el menú ⋮ de Chrome y elegí “Instalar aplicación” o “Agregar a pantalla principal”.</p>
          <p className="mt-2"><b>iPhone:</b> abrí en Safari, tocá Compartir y elegí “Agregar a inicio”.</p>
          <p className="mt-2 text-xs text-amber-200">Si estás dentro de WhatsApp o Instagram, primero elegí “Abrir en navegador”.</p>
        </div>}
        {message && <p className="mt-4 text-sm text-amber-200">{message}</p>}
        <a href={`/instalar/${id}?abrir=1`} className="mt-5 inline-block text-sm font-bold text-slate-300 underline">Usar la app sin instalar</a>
      </div>
    </div>
  </main>;
}
