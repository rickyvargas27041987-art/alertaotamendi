"use client";

import { useState } from "react";

const categories = [
  { icon: "🚨", title: "Delito / Robo", color: "bg-red-500" },
  { icon: "👤", title: "Persona sospechosa", color: "bg-orange-500" },
  { icon: "🚗", title: "Vehículo sospechoso", color: "bg-yellow-500" },
  { icon: "⚠️", title: "Accidente", color: "bg-blue-500" },
  { icon: "🔥", title: "Incendio", color: "bg-purple-500" },
  { icon: "🆘", title: "Emergencia", color: "bg-emerald-500" },
];

export default function Home() {
  const [selected, setSelected] = useState("");

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-md px-5 pb-10">

        {/* ENCABEZADO */}
        <header className="flex items-center justify-between py-6">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500 text-2xl shadow-lg shadow-red-500/20">
                🚨
              </div>

              <div>
                <h1 className="text-xl font-bold tracking-tight">
                  ALERTA
                </h1>
                <p className="text-sm font-semibold text-red-400">
                  OTAMENDI
                </p>
              </div>
            </div>
          </div>

          <button className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-800 text-xl">
            🔔
          </button>
        </header>

        {/* SALUDO */}
        <section className="mb-7 mt-4">
          <p className="text-slate-400">Bienvenido</p>

          <h2 className="mt-1 text-3xl font-bold">
            ¿Qué está pasando?
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-400">
            Informá rápidamente una situación para ayudar a mantener
            comunicada a nuestra comunidad.
          </p>
        </section>

        {/* CATEGORÍAS */}
        <section>
          <div className="grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.title}
                onClick={() => setSelected(category.title)}
                className={`rounded-3xl border p-5 text-left transition-all ${
                  selected === category.title
                    ? "border-white bg-slate-700 scale-[0.98]"
                    : "border-slate-800 bg-slate-900 hover:bg-slate-800"
                }`}
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${category.color} text-2xl`}
                >
                  {category.icon}
                </div>

                <p className="text-sm font-semibold">
                  {category.title}
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* REPORTE RÁPIDO */}
        {selected && (
          <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">
              Categoría seleccionada
            </p>

            <h3 className="mt-1 text-xl font-bold">
              {selected}
            </h3>

            <textarea
              placeholder="Contanos qué estás observando..."
              className="mt-4 h-32 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm outline-none placeholder:text-slate-600 focus:border-red-500"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <button className="rounded-2xl bg-slate-800 py-3 text-sm font-semibold">
                📷 Foto
              </button>

              <button className="rounded-2xl bg-slate-800 py-3 text-sm font-semibold">
                📍 Ubicación
              </button>
            </div>

            <button className="mt-4 w-full rounded-2xl bg-red-500 py-4 font-bold shadow-lg shadow-red-500/20 transition hover:bg-red-600">
              🚨 ENVIAR ALERTA
            </button>
          </section>
        )}

        {/* ACCESOS */}
        <section className="mt-7 grid grid-cols-2 gap-3">
          <button className="rounded-2xl border border-slate-800 bg-slate-900 py-4 text-sm font-semibold">
            🗺️ Ver mapa
          </button>

          <button className="rounded-2xl border border-slate-800 bg-slate-900 py-4 text-sm font-semibold">
            📋 Mis reportes
          </button>
        </section>

        {/* INFORMACIÓN */}
        <section className="mt-7 rounded-3xl bg-slate-900 p-5">
          <div className="flex gap-3">
            <div className="text-xl">ℹ️</div>

            <div>
              <h3 className="font-semibold">
                Usá la aplicación responsablemente
              </h3>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                Informá solamente situaciones que hayas observado.
                Los reportes serán revisados antes de tomar acciones.
              </p>
            </div>
          </div>
        </section>

        {/* PIE */}
        <footer className="py-8 text-center text-xs text-slate-600">
          ALERТA OTAMENDI · Comunidad conectada
        </footer>

      </div>
    </main>
  );
}