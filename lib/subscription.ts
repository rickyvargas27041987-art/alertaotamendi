export type SubscriptionPlan = "COURTESY" | "TRIAL" | "MONTHLY" | "ANNUAL";
export type SubscriptionStatus = "ACTIVE" | "PENDING" | "PAST_DUE" | "SUSPENDED" | "CANCELED";

export type SubscriptionLike = {
  role?: string | null;
  active?: boolean | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
  subscriptionAutoRenew?: boolean | null;
  mpStatus?: string | null;
};

export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  COURTESY: "Cortesía",
  TRIAL: "Prueba",
  MONTHLY: "Mensual",
  ANNUAL: "Anual",
};

export function normalizePlan(value: unknown): SubscriptionPlan {
  const plan = String(value ?? "").toUpperCase();
  return (["COURTESY", "TRIAL", "MONTHLY", "ANNUAL"] as const).includes(plan as SubscriptionPlan)
    ? (plan as SubscriptionPlan)
    : "COURTESY";
}

export function normalizeStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? "").toUpperCase();
  return (["ACTIVE", "PENDING", "PAST_DUE", "SUSPENDED", "CANCELED"] as const).includes(status as SubscriptionStatus)
    ? (status as SubscriptionStatus)
    : "ACTIVE";
}

export function subscriptionHasAccess(user: SubscriptionLike, now = new Date()) {
  if (!user.active) return false;
  // Los administradores del sistema no quedan bloqueados por facturación.
  if (String(user.role).toUpperCase() === "ADMIN") return true;

  const plan = normalizePlan(user.subscriptionPlan);
  const status = normalizeStatus(user.subscriptionStatus);
  if (status !== "ACTIVE") return false;
  if (plan === "COURTESY") return true;

  // Una suscripción recurrente de Mercado Pago autorizada se considera activa.
  if (user.subscriptionAutoRenew && String(user.mpStatus ?? "").toLowerCase() === "authorized") return true;

  if (!user.subscriptionEndsAt) return false;
  return new Date(user.subscriptionEndsAt).getTime() > now.getTime();
}

export function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(base: Date, months: number) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function subscriptionDisplay(user: SubscriptionLike) {
  const plan = normalizePlan(user.subscriptionPlan);
  const status = normalizeStatus(user.subscriptionStatus);
  return { plan, status, hasAccess: subscriptionHasAccess(user) };
}
