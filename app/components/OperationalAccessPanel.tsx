"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type AccessSession = {
  id: number;
  officerName: string;
  agency: string;
  serviceType: string;
  createdAt: string;
  lastAccessAt: string;
  expiresAt: string;
};

type Zone = {
  province: string;
  district: string;
  locality: string | null;
};

type Organization = {
  id: number;
  name: string;
  shortName: string | null;
  type: string;
  active: boolean;
  canCoordinate: boolean;
  network: {
    id: number;
    name: string;
    province: string;
    district: string;
  };
  zones: Zone[];
  mobileAccessConfig?: {
    id: number;
    updatedAt: string;
  } | null;
};

const TYPE_LABELS: Record<string, string> = {
  MONITORING: "Centro de Monitoreo",
  MUNICIPAL: "Municipio",
  POLICE: "Policía",
  FIRE: "Bomberos",
  MEDICAL: "Emergencias Médicas",
  CIVIL_DEFENSE: "Defensa Civil",
  OTHER: "Otro organismo",
};

const TYPE_ICONS: Record<string, string> = {
  MONITORING: "🖥️",
  MUNICIPAL: "🏛️",
  POLICE: "👮",
  FIRE: "🚒",
  MEDICAL: "🏥",
  CIVIL_DEFENSE: "🛡️",
  OTHER: "🏢",
};

const serviceLabel: Record<string, string> = {
  POLICE: "Policía",
  FIRE: "Bomberos",
  MEDICAL: "Emergencias médicas",
  CIVIL_DEFENSE: "Defensa Civil",
  MUNICIPAL: "Centro / Municipio",
};

const MOBILE_SUPPORTED_TYPES = new Set([
  "MONITORING",
  "MUNICIPAL",
  "POLICE",
  "FIRE",
  "MEDICAL",
  "CIVIL_DEFENSE",
]);

function zoneText(zone: Zone) {
  return [zone.locality, zone.district, zone.province]
    .filter(Boolean)
    .join(" · ");
}

export default function OperationalAccessPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] =
    useState<number | "">("");

  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sessions, setSessions] = useState<AccessSession[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);

  const supportedOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) =>
          organization.active &&
          MOBILE_SUPPORTED_TYPES.has(organization.type)
      ),
    [organizations]
  );

  const selectedOrganization = useMemo(
    () =>
      supportedOrganizations.find(
        (organization) => organization.id === selectedOrganizationId
      ) ?? null,
    [selectedOrganizationId, supportedOrganizations]
  );

  const loadOrganization = useCallback(async (organizationId: number) => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/admin/operational-access?organizationId=${organizationId}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo cargar el acceso móvil del organismo."
        );
      }

      setOrganizations(
        Array.isArray(data.organizations) ? data.organizations : []
      );
      setCode(data.code || "");
      setExpiresAt(data.expiresAt || "");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      setZones(Array.isArray(data.zones) ? data.zones : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el acceso móvil del organismo."
      );
      setCode("");
      setExpiresAt("");
      setSessions([]);
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/operational-access", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo cargar el acceso móvil operativo."
        );
      }

      const incomingOrganizations: Organization[] = Array.isArray(
        data.organizations
      )
        ? data.organizations
        : [];

      setOrganizations(incomingOrganizations);

      const supported = incomingOrganizations.filter(
        (organization) =>
          organization.active &&
          MOBILE_SUPPORTED_TYPES.has(organization.type)
      );

      if (supported.length === 0) {
        setSelectedOrganizationId("");
        setCode("");
        setExpiresAt("");
        setSessions([]);
        setZones([]);
        setLoading(false);
        return;
      }

      const currentIsValid = supported.some(
        (organization) => organization.id === selectedOrganizationId
      );

      const nextId = currentIsValid
        ? Number(selectedOrganizationId)
        : supported[0].id;

      setSelectedOrganizationId(nextId);

      const organizationResponse = await fetch(
        `/api/admin/operational-access?organizationId=${nextId}`,
        { cache: "no-store" }
      );

      const organizationData = await organizationResponse.json();

      if (!organizationResponse.ok || !organizationData.success) {
        throw new Error(
          organizationData.error ||
            "No se pudo cargar el código del organismo."
        );
      }

      setCode(organizationData.code || "");
      setExpiresAt(organizationData.expiresAt || "");
      setSessions(
        Array.isArray(organizationData.sessions)
          ? organizationData.sessions
          : []
      );
      setZones(
        Array.isArray(organizationData.zones) ? organizationData.zones : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el acceso móvil operativo."
      );
    } finally {
      setLoading(false);
    }
  }, [selectedOrganizationId]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [open, load]);

  async function chooseOrganization(value: string) {
    const organizationId = Number(value);

    if (!Number.isInteger(organizationId) || organizationId <= 0) {
      setSelectedOrganizationId("");
      return;
    }

    setSelectedOrganizationId(organizationId);
    await loadOrganization(organizationId);
  }

  async function rotate() {
    if (!selectedOrganization) return;

    if (
      !window.confirm(
        `¿Generar un código nuevo para ${selectedOrganization.name}? El código anterior y todos sus accesos activos dejarán de funcionar.`
      )
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/operational-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rotate",
          organizationId: selectedOrganization.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo renovar el código del organismo."
        );
      }

      await loadOrganization(selectedOrganization.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo renovar el código del organismo."
      );
      setLoading(false);
    }
  }

  async function revoke(sessionId: number) {
    if (!selectedOrganization) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/operational-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revoke_session",
          sessionId,
          organizationId: selectedOrganization.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo revocar el acceso."
        );
      }

      await loadOrganization(selectedOrganization.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo revocar el acceso."
      );
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-cyan-500/40 bg-cyan-950/40 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-900/50"
        title="Administrar accesos móviles temporales por organismo"
      >
        📱 Acceso móvil operativo
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border border-cyan-800/60 bg-slate-950 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                  Red Operativa · acceso temporal
                </p>
                <h2 className="mt-1 text-2xl font-black">
                  📱 Acceso móvil operativo
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-400">
                  Cada organismo tiene su propio código. El personal que ingresa
                  queda identificado automáticamente como perteneciente a ese
                  organismo y sólo utiliza su jurisdicción habilitada.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <label className="block text-sm font-black text-slate-200">
                Organismo
                <select
                  value={selectedOrganizationId}
                  onChange={(event) =>
                    void chooseOrganization(event.target.value)
                  }
                  disabled={loading || supportedOrganizations.length === 0}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-normal outline-none focus:border-cyan-500 disabled:opacity-50"
                >
                  {supportedOrganizations.length === 0 && (
                    <option value="">No hay organismos disponibles</option>
                  )}

                  {supportedOrganizations.map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {TYPE_ICONS[organization.type] || "🏢"}{" "}
                      {organization.shortName || organization.name}
                    </option>
                  ))}
                </select>
              </label>

              {selectedOrganization && (
                <div className="mt-3 rounded-xl border border-cyan-900/50 bg-cyan-950/20 p-3">
                  <p className="font-black text-cyan-100">
                    {TYPE_ICONS[selectedOrganization.type] || "🏢"}{" "}
                    {selectedOrganization.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {TYPE_LABELS[selectedOrganization.type] ||
                      selectedOrganization.type}
                    {" · "}
                    {selectedOrganization.network.district}
                    {" · "}
                    {selectedOrganization.network.province}
                  </p>
                </div>
              )}
            </div>

            {selectedOrganization ? (
              <>
                <div className="mt-4 rounded-3xl border border-cyan-500/30 bg-cyan-950/20 p-5 text-center">
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                    Código vigente de {selectedOrganization.shortName || "este organismo"}
                  </p>

                  <p className="mt-2 font-mono text-5xl font-black tracking-[0.18em] text-white">
                    {loading && !code ? "••••••" : code || "------"}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Cambia automáticamente cada 12 horas.
                  </p>

                  {expiresAt && (
                    <p className="mt-1 text-xs font-semibold text-cyan-200">
                      Vence: {new Date(expiresAt).toLocaleString("es-AR")}
                    </p>
                  )}

                  <button
                    type="button"
                    disabled={loading || !code}
                    onClick={() => void rotate()}
                    className="mt-4 rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black hover:bg-cyan-500 disabled:opacity-50"
                  >
                    ↻ Cambiar código ahora
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="font-bold">📍 Jurisdicción habilitada</p>

                  <div className="mt-2 space-y-1 text-sm text-slate-300">
                    {zones.length ? (
                      zones.map((zone, index) => (
                        <p
                          key={`${zone.province}-${zone.district}-${zone.locality}-${index}`}
                        >
                          {zoneText(zone)}
                        </p>
                      ))
                    ) : (
                      <p className="text-amber-300">
                        No hay una jurisdicción asignada.
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-black">
                        Dispositivos con acceso ({sessions.length})
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Sólo sesiones generadas con el código de este organismo.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        void loadOrganization(selectedOrganization.id)
                      }
                      className="text-xs font-bold text-cyan-300 disabled:opacity-50"
                    >
                      ↻ Actualizar
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {!sessions.length && (
                      <div className="rounded-2xl bg-slate-900 p-4 text-sm text-slate-500">
                        No hay accesos activos para este organismo.
                      </div>
                    )}

                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3"
                      >
                        <div className="min-w-0 text-sm">
                          <p className="font-bold text-white">
                            {session.officerName}
                          </p>
                          <p className="truncate text-slate-400">
                            {session.agency} ·{" "}
                            {serviceLabel[session.serviceType] ||
                              session.serviceType}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Última consulta:{" "}
                            {new Date(session.lastAccessAt).toLocaleString(
                              "es-AR"
                            )}
                          </p>
                        </div>

                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => void revoke(session.id)}
                          className="shrink-0 rounded-xl border border-red-800 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50"
                        >
                          Revocar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-emerald-800/50 bg-emerald-950/20 p-4 text-xs leading-5 text-emerald-100">
                  <p className="font-black">✓ Identidad automática</p>
                  <p className="mt-1 text-emerald-100/70">
                    Cuando terminemos la adaptación de la pantalla móvil, el
                    personal sólo ingresará este código y su nombre. Ya no
                    podrá elegir libremente Policía, Bomberos, Salud u otro
                    servicio.
                  </p>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">
                No hay organismos habilitados para acceso móvil.
              </div>
            )}

            <p className="mt-4 text-xs leading-5 text-slate-500">
              El acceso no muestra la identidad del vecino. Los ingresos,
              consultas, cambios de estado y aperturas de navegación quedan
              registrados.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
