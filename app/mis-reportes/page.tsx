 "use client";
 export default function MisReportesPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-5 py-8">
        <button
          onClick={() => {
            window.location.href = "/";
          }}
          className="mb-6 text-sm text-slate-400 hover:text-white"
        >
          ← Volver
        </button>

        <h1 className="text-2xl font-bold">📄 Mis reportes</h1>

        <p className="mt-2 text-sm text-slate-400">
          Acá podrás consultar el estado de las alertas que enviaste.
        </p>
      </div>
    </main>
  );
}