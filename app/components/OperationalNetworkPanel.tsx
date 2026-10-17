"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Zone = {
  id: number;
  province: string;
  district: string;
  locality: string | null;
};

type Organization = {
  id: number;
  networkId: number;
  name: string;
  shortName: string | null;
  type: string;
  active: boolean;
  canCoordinate: boolean;
  zones: Zone[];
  _count?: {
    members: number;
    responses: number;
  };
};

type Network = {
  id: number;
  name: string;
  province: string;
  district: string;
  active: boolean;
  organizations: Organization[];
  _count?: {
    incidents: number;
  };
};

type MemberUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  organizationType: string;
  active: boolean;
  lastLoginAt: string | null;
};

type Membership = {
  id: number;
  role: string;
  active: boolean;
  isPrimary: boolean;
  user: MemberUser;
};

type EligibleUser = {
  id: number;
  username: string;
  name: string;
  role: string;
  organizationType: string;
  active: boolean;
  memberships: Array<{
    id: number;
    role: string;
    active: boolean;
    isPrimary: boolean;
    organization: {
      id: number;
      name: string;
      shortName: string | null;
      type: string;
    };
  }>;
};

type FormState = {
  networkId: number | "";
  organizationId: number | null;
  name: string;
  shortName: string;
  type: string;
  locality: string;
  canCoordinate: boolean;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  networkId: "",
  organizationId: null,
  name: "",
  shortName: "",
  type: "MONITORING",
  locality: "",
  canCoordinate: false,
  active: true,
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

const MEMBER_ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  COORDINATOR: "Coordinador",
  DISPATCHER: "Despachador",
  OPERATOR: "Operador",
  VIEWER: "Solo lectura",
};

function zoneText(zone: Zone) {
  return [zone.locality, zone.district, zone.province]
    .filter(Boolean)
    .join(" · ");
}

export default function OperationalNetworkPanel() {
  const [open, setOpen] = useState(false);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const [membersOpen, setMembersOpen] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSavingId, setMemberSavingId] = useState<number | null>(null);
  const [memberError, setMemberError] = useState("");
  const [memberCanEdit, setMemberCanEdit] = useState(false);
  const [memberOrganization, setMemberOrganization] =
    useState<Organization | null>(null);
  const [members, setMembers] = useState<Membership[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [newMemberUserId, setNewMemberUserId] = useState<number | "">("");
  const [newMemberRole, setNewMemberRole] = useState("OPERATOR");
  const [newMemberPrimary, setNewMemberPrimary] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/operational-network", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo cargar la Red Operativa."
        );
      }

      setNetworks(
        Array.isArray(data.networks) ? data.networks : []
      );
      setCanEdit(Boolean(data.canEdit));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cargar la Red Operativa."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  const totals = useMemo(() => {
    const organizations = networks.flatMap(
      (network) => network.organizations || []
    );

    return {
      networks: networks.length,
      organizations: organizations.length,
      activeOrganizations: organizations.filter(
        (organization) => organization.active
      ).length,
      coordinators: organizations.filter(
        (organization) =>
          organization.active && organization.canCoordinate
      ).length,
      incidents: networks.reduce(
        (sum, network) =>
          sum + (network._count?.incidents || 0),
        0
      ),
    };
  }, [networks]);

  function createOrganization(network: Network) {
    setError("");
    setForm({
      ...EMPTY_FORM,
      networkId: network.id,
    });
    setFormOpen(true);
  }

  function editOrganization(
    organization: Organization
  ) {
    const mainZone = organization.zones?.[0];

    setError("");
    setForm({
      networkId: organization.networkId,
      organizationId: organization.id,
      name: organization.name,
      shortName: organization.shortName || "",
      type: organization.type,
      locality: mainZone?.locality || "",
      canCoordinate: organization.canCoordinate,
      active: organization.active,
    });
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setForm(EMPTY_FORM);
  }

  const loadMembers = useCallback(async (organizationId: number) => {
    setMembersLoading(true);
    setMemberError("");

    try {
      const response = await fetch(
        `/api/admin/operational-network/members?organizationId=${organizationId}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudieron cargar los miembros."
        );
      }

      setMemberCanEdit(Boolean(data.canEdit));
      setMembers(Array.isArray(data.members) ? data.members : []);
      setEligibleUsers(
        Array.isArray(data.eligibleUsers) ? data.eligibleUsers : []
      );
    } catch (err) {
      setMemberError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los miembros."
      );
    } finally {
      setMembersLoading(false);
    }
  }, []);

  function openMembers(organization: Organization) {
    setMemberOrganization(organization);
    setMembersOpen(true);
    setMemberError("");
    setNewMemberUserId("");
    setNewMemberRole("OPERATOR");
    setNewMemberPrimary(false);
    void loadMembers(organization.id);
  }

  function closeMembers() {
    if (memberSavingId !== null) return;
    setMembersOpen(false);
    setMemberOrganization(null);
    setMembers([]);
    setEligibleUsers([]);
    setMemberError("");
  }

  async function addMember() {
    if (
      !memberOrganization ||
      newMemberUserId === ""
    ) {
      setMemberError("Elegí un usuario para agregar.");
      return;
    }

    setMemberSavingId(-1);
    setMemberError("");

    try {
      const response = await fetch(
        "/api/admin/operational-network/members",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organizationId: memberOrganization.id,
            userId: newMemberUserId,
            role: newMemberRole,
            isPrimary: newMemberPrimary,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo agregar el miembro."
        );
      }

      setNewMemberUserId("");
      setNewMemberRole("OPERATOR");
      setNewMemberPrimary(false);

      await Promise.all([
        loadMembers(memberOrganization.id),
        load(),
      ]);
    } catch (err) {
      setMemberError(
        err instanceof Error
          ? err.message
          : "No se pudo agregar el miembro."
      );
    } finally {
      setMemberSavingId(null);
    }
  }

  async function updateMember(
    membershipId: number,
    patch: {
      role?: string;
      active?: boolean;
      isPrimary?: boolean;
    }
  ) {
    if (!memberOrganization) return;

    setMemberSavingId(membershipId);
    setMemberError("");

    try {
      const response = await fetch(
        "/api/admin/operational-network/members",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            membershipId,
            ...patch,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "No se pudo actualizar el miembro."
        );
      }

      await Promise.all([
        loadMembers(memberOrganization.id),
        load(),
      ]);
    } catch (err) {
      setMemberError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el miembro."
      );
    } finally {
      setMemberSavingId(null);
    }
  }

  async function saveOrganization(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const editing = form.organizationId !== null;

      const response = await fetch(
        "/api/admin/operational-network",
        {
          method: editing ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            editing
              ? {
                  organizationId:
                    form.organizationId,
                  name: form.name,
                  shortName: form.shortName,
                  type: form.type,
                  locality: form.locality,
                  canCoordinate:
                    form.canCoordinate,
                  active: form.active,
                }
              : {
                  action:
                    "create_organization",
                  networkId: form.networkId,
                  name: form.name,
                  shortName: form.shortName,
                  type: form.type,
                  locality: form.locality,
                  canCoordinate:
                    form.canCoordinate,
                }
          ),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            "No se pudo guardar el organismo."
        );
      }

      setFormOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar el organismo."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-cyan-400/50 bg-cyan-950/45 px-4 py-3 text-sm font-black text-cyan-100 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-900/50"
        title="Abrir la Red Operativa multi-organismo"
      >
        🛡️ Red Operativa
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl overflow-y-auto rounded-[30px] border border-cyan-700/50 bg-slate-950 p-4 shadow-2xl sm:p-6"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">
                  Coordinación multi-organismo
                </p>
                <h2 className="mt-1 text-2xl font-black sm:text-3xl">
                  🛡️ Red Operativa
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                  Una misma red para Centros de Monitoreo,
                  Policía, Bomberos, Salud, Defensa Civil y
                  Municipio, manteniendo cada organismo con
                  identidad y operación propia.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 font-black hover:bg-slate-700"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-red-700 bg-red-950/40 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Redes
                </p>
                <p className="mt-2 text-3xl font-black">
                  {totals.networks}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Organismos
                </p>
                <p className="mt-2 text-3xl font-black text-cyan-200">
                  {totals.activeOrganizations}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Coordinadores
                </p>
                <p className="mt-2 text-3xl font-black text-violet-200">
                  {totals.coordinators}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Incidentes
                </p>
                <p className="mt-2 text-3xl font-black text-orange-200">
                  {totals.incidents}
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Estado
                </p>
                <p className="mt-2 text-lg font-black text-emerald-300">
                  {loading
                    ? "Actualizando…"
                    : "● Operativa"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xl font-black">
                  Organismos de la red
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Cada organismo mantiene sus propios usuarios,
                  estados e intervenciones.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                ↻ Actualizar
              </button>
            </div>

            <div className="mt-4 space-y-5">
              {!loading && networks.length === 0 && (
                <div className="rounded-3xl border border-amber-700/50 bg-amber-950/25 p-5 text-sm text-amber-100">
                  No se encontró una Red Operativa para tu
                  jurisdicción.
                </div>
              )}

              {networks.map((network) => (
                <section
                  key={network.id}
                  className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-lg font-black text-white">
                          {network.name}
                        </h4>
                        <span className="rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-300">
                          Activa
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-400">
                        📍 {network.district} · {network.province}
                      </p>

                      <p className="mt-1 text-xs text-slate-600">
                        {network.organizations.length} organismos registrados
                      </p>
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          createOrganization(network)
                        }
                        className="rounded-xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-500"
                      >
                        + Agregar organismo
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {network.organizations.length === 0 && (
                      <div className="md:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-6 text-center">
                        <p className="text-3xl">🧩</p>
                        <p className="mt-2 font-bold text-slate-300">
                          Todavía no hay organismos cargados.
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Empezá agregando el Centro de Monitoreo,
                          Policía, Bomberos, Salud o Defensa Civil.
                        </p>
                      </div>
                    )}

                    {network.organizations.map(
                      (organization) => {
                        const mainZone =
                          organization.zones?.[0];

                        return (
                          <div
                            key={organization.id}
                            className={`rounded-2xl border p-4 ${
                              organization.active
                                ? "border-slate-700 bg-slate-950"
                                : "border-slate-800 bg-slate-950/50 opacity-60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-2xl">
                                  {TYPE_ICONS[
                                    organization.type
                                  ] || "🏢"}
                                </div>

                                <div className="min-w-0">
                                  <p className="truncate font-black text-white">
                                    {organization.name}
                                  </p>
                                  <p className="mt-1 text-xs font-semibold text-cyan-300">
                                    {TYPE_LABELS[
                                      organization.type
                                    ] ||
                                      organization.type}
                                  </p>
                                </div>
                              </div>

                              <span
                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                  organization.active
                                    ? "bg-emerald-400"
                                    : "bg-slate-600"
                                }`}
                                title={
                                  organization.active
                                    ? "Activo"
                                    : "Inactivo"
                                }
                              />
                            </div>

                            <div className="mt-4 space-y-2 text-xs text-slate-400">
                              <p>
                                📍{" "}
                                {mainZone
                                  ? zoneText(mainZone)
                                  : `${network.district} · ${network.province}`}
                              </p>

                              {organization.shortName && (
                                <p>
                                  🏷️{" "}
                                  {organization.shortName}
                                </p>
                              )}

                              <p>
                                👥{" "}
                                {organization._count?.members ||
                                  0}{" "}
                                miembros
                              </p>

                              {organization.canCoordinate && (
                                <p className="font-bold text-violet-300">
                                  ★ Puede coordinar incidentes
                                </p>
                              )}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openMembers(
                                    organization
                                  )
                                }
                                className="rounded-xl border border-cyan-800 bg-cyan-950/30 px-3 py-2 text-xs font-black text-cyan-200 hover:bg-cyan-900/40"
                              >
                                👥 Miembros
                              </button>

                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    editOrganization(
                                      organization
                                    )
                                  }
                                  className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-800"
                                >
                                  ⚙️ Administrar
                                </button>
                              ) : (
                                <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-center text-xs font-bold text-slate-600">
                                  Solo consulta
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              ))}
            </div>

            {!canEdit && (
              <p className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-500">
                Tu perfil puede consultar la Red Operativa,
                pero la creación o modificación de organismos
                está reservada a administradores del Centro.
              </p>
            )}
          </div>
        </div>
      )}

      {membersOpen && memberOrganization && (
        <div
          className="fixed inset-0 z-[115000] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-4"
          onClick={closeMembers}
        >
          <div
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-cyan-800/60 bg-slate-950 p-4 shadow-2xl sm:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-cyan-300">
                  Miembros del organismo
                </p>
                <h3 className="mt-1 text-2xl font-black">
                  {TYPE_ICONS[memberOrganization.type] || "🏢"}{" "}
                  {memberOrganization.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Cada persona usa su cuenta habitual del Centro,
                  pero dentro de la Red Operativa tiene un rol propio.
                </p>
              </div>

              <button
                type="button"
                onClick={closeMembers}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800"
              >
                ✕
              </button>
            </div>

            {memberError && (
              <div className="mt-4 rounded-2xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
                {memberError}
              </div>
            )}

            {memberCanEdit && (
              <div className="mt-5 rounded-3xl border border-cyan-800/40 bg-cyan-950/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-black text-cyan-100">
                      + Agregar usuario existente
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      El usuario debe existir en “Usuarios” y tener jurisdicción
                      compatible con esta Red Operativa.
                    </p>
                  </div>

                  <a
                    href="/admin/usuarios"
                    className="shrink-0 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
                  >
                    👤 Usuarios
                  </a>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold">
                    Usuario
                    <select
                      value={newMemberUserId}
                      onChange={(event) =>
                        setNewMemberUserId(
                          event.target.value
                            ? Number(event.target.value)
                            : ""
                        )
                      }
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal outline-none focus:border-cyan-500"
                    >
                      <option value="">Seleccionar usuario</option>
                      {eligibleUsers
                        .filter(
                          (user) =>
                            !members.some(
                              (membership) =>
                                membership.user.id === user.id &&
                                membership.active
                            )
                        )
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} · @{user.username}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="text-sm font-bold">
                    Rol operativo
                    <select
                      value={newMemberRole}
                      onChange={(event) =>
                        setNewMemberRole(event.target.value)
                      }
                      className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal outline-none focus:border-cyan-500"
                    >
                      {Object.entries(MEMBER_ROLE_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                <label className="mt-3 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                  <input
                    type="checkbox"
                    checked={newMemberPrimary}
                    onChange={(event) =>
                      setNewMemberPrimary(event.target.checked)
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      Organismo principal de este usuario
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Sirve para decidir qué institución representa por defecto
                      cuando entre a la Red Operativa.
                    </span>
                  </span>
                </label>

                <button
                  type="button"
                  onClick={() => void addMember()}
                  disabled={
                    memberSavingId !== null ||
                    newMemberUserId === ""
                  }
                  className="mt-4 w-full rounded-2xl bg-cyan-600 py-3 text-sm font-black text-white hover:bg-cyan-500 disabled:opacity-40"
                >
                  {memberSavingId === -1
                    ? "AGREGANDO…"
                    : "AGREGAR AL ORGANISMO"}
                </button>

                {!membersLoading &&
                  eligibleUsers.filter(
                    (user) =>
                      !members.some(
                        (membership) =>
                          membership.user.id === user.id &&
                          membership.active
                      )
                  ).length === 0 && (
                    <p className="mt-3 rounded-xl border border-amber-800/50 bg-amber-950/20 p-3 text-xs leading-5 text-amber-200">
                      No hay otros usuarios activos disponibles en esta
                      jurisdicción. Si necesitás uno nuevo, crealo primero
                      desde “Usuarios”.
                    </p>
                  )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-black">
                  Miembros ({members.filter((member) => member.active).length})
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  Los cambios quedan asociados a la persona y al organismo.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadMembers(memberOrganization.id)
                }
                disabled={membersLoading}
                className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 disabled:opacity-50"
              >
                ↻ Actualizar
              </button>
            </div>

            <div className="mt-3 space-y-3">
              {membersLoading && (
                <div className="rounded-2xl bg-slate-900 p-5 text-sm text-slate-500">
                  Cargando miembros…
                </div>
              )}

              {!membersLoading && members.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
                  <p className="text-3xl">👥</p>
                  <p className="mt-2 font-bold text-slate-300">
                    Este organismo todavía no tiene usuarios vinculados.
                  </p>
                </div>
              )}

              {!membersLoading &&
                members.map((membership) => (
                  <div
                    key={membership.id}
                    className={`rounded-2xl border p-4 ${
                      membership.active
                        ? "border-slate-700 bg-slate-900"
                        : "border-slate-800 bg-slate-900/40 opacity-60"
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-white">
                            {membership.user.name}
                          </p>

                          {membership.isPrimary && (
                            <span className="rounded-full border border-violet-700/50 bg-violet-950/40 px-2 py-1 text-[10px] font-black uppercase text-violet-300">
                              Principal
                            </span>
                          )}

                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                              membership.active
                                ? "bg-emerald-950 text-emerald-300"
                                : "bg-slate-800 text-slate-500"
                            }`}
                          >
                            {membership.active ? "Activo" : "Inactivo"}
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-slate-500">
                          @{membership.user.username} · Cuenta:{" "}
                          {membership.user.role}
                        </p>
                      </div>

                      <div className="shrink-0 text-xs font-bold text-cyan-300">
                        {MEMBER_ROLE_LABELS[membership.role] ||
                          membership.role}
                      </div>
                    </div>

                    {memberCanEdit && (
                      <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                        <select
                          value={membership.role}
                          disabled={memberSavingId === membership.id}
                          onChange={(event) =>
                            void updateMember(membership.id, {
                              role: event.target.value,
                            })
                          }
                          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold outline-none focus:border-cyan-500 disabled:opacity-50"
                        >
                          {Object.entries(MEMBER_ROLE_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            )
                          )}
                        </select>

                        <button
                          type="button"
                          disabled={
                            memberSavingId === membership.id ||
                            !membership.active
                          }
                          onClick={() =>
                            void updateMember(membership.id, {
                              isPrimary: !membership.isPrimary,
                            })
                          }
                          className="rounded-xl border border-violet-800 px-3 py-2 text-xs font-black text-violet-300 disabled:opacity-40"
                        >
                          {membership.isPrimary
                            ? "★ Principal"
                            : "☆ Hacer principal"}
                        </button>

                        <button
                          type="button"
                          disabled={memberSavingId === membership.id}
                          onClick={() =>
                            void updateMember(membership.id, {
                              active: !membership.active,
                            })
                          }
                          className={`rounded-xl border px-3 py-2 text-xs font-black disabled:opacity-40 ${
                            membership.active
                              ? "border-red-800 text-red-300"
                              : "border-emerald-800 text-emerald-300"
                          }`}
                        >
                          {memberSavingId === membership.id
                            ? "Guardando…"
                            : membership.active
                            ? "Desactivar"
                            : "Reactivar"}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {!memberCanEdit && (
              <p className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-500">
                Tu perfil puede consultar los miembros de este organismo,
                pero no modificar sus roles ni membresías.
              </p>
            )}
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-[110000] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={closeForm}
        >
          <form
            onSubmit={saveOrganization}
            onClick={(event) =>
              event.stopPropagation()
            }
            className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-[28px] border border-cyan-800/60 bg-slate-950 p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-cyan-300">
                  Red Operativa
                </p>
                <h3 className="mt-1 text-2xl font-black">
                  {form.organizationId
                    ? "Administrar organismo"
                    : "Agregar organismo"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeForm}
                className="h-9 w-9 rounded-full bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block text-sm font-bold">
                Nombre del organismo
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  maxLength={160}
                  placeholder="Ej.: Bomberos Voluntarios Otamendi"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal outline-none focus:border-cyan-500"
                  required
                />
              </label>

              <label className="block text-sm font-bold">
                Nombre corto
                <input
                  value={form.shortName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      shortName:
                        event.target.value,
                    }))
                  }
                  maxLength={80}
                  placeholder="Ej.: Bomberos Otamendi"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal outline-none focus:border-cyan-500"
                />
              </label>

              <label className="block text-sm font-bold">
                Tipo de organismo
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal outline-none focus:border-cyan-500"
                >
                  {Object.entries(
                    TYPE_LABELS
                  ).map(([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {TYPE_ICONS[value]} {label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-bold">
                Localidad
                <input
                  value={form.locality}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      locality:
                        event.target.value,
                    }))
                  }
                  maxLength={120}
                  placeholder="Vacío = todo el distrito"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 p-3 font-normal outline-none focus:border-cyan-500"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Si queda vacío, el organismo tendrá
                  cobertura sobre todo el distrito.
                </span>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-violet-800/50 bg-violet-950/20 p-4">
                <input
                  type="checkbox"
                  checked={
                    form.canCoordinate
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      canCoordinate:
                        event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="block font-bold text-violet-200">
                    Puede coordinar incidentes
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Usalo para Centros de Monitoreo,
                    Defensa Civil u organismos que puedan
                    asumir coordinación general. No les
                    permite modificar la intervención de
                    otro organismo.
                  </span>
                </span>
              </label>

              {form.organizationId && (
                <label className="flex items-start gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        active:
                          event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block font-bold">
                      Organismo activo
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Desactivarlo conserva su historial
                      pero deja de considerarlo operativo.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={
                saving ||
                !form.name.trim() ||
                !form.networkId
              }
              className="mt-6 w-full rounded-2xl bg-cyan-600 py-4 font-black text-white hover:bg-cyan-500 disabled:opacity-40"
            >
              {saving
                ? "GUARDANDO…"
                : form.organizationId
                ? "GUARDAR CAMBIOS"
                : "CREAR ORGANISMO"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
