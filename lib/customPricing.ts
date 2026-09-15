// Importes en centavos: no usar flotantes para almacenar dinero.
export function parsePrice(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new Error("Ingresá el importe como texto.");
  const input = value.trim().replace(",", ".");
  if (!input) return null;
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(input)) throw new Error("Usá un importe sin separadores de miles y con hasta 2 decimales.");
  const [whole, fraction = ""] = input.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (cents <= 0 || cents > 2_000_000_000) throw new Error("El importe debe ser mayor a cero y no superar ARS 20.000.000.");
  return cents;
}

export function priceLabel(cents: number | null) {
  return cents === null ? "Sin asignar" : new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(cents / 100);
}

export function priceInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export function recurringTerms(plan: string, cents: number) {
  if (!["MONTHLY", "ANNUAL"].includes(plan) || !Number.isInteger(cents) || cents <= 0 || cents > 2_000_000_000) {
    throw new Error("Plan o importe inválido.");
  }
  return { frequency: plan === "MONTHLY" ? 1 : 12, frequency_type: "months", transaction_amount: cents / 100, currency_id: "ARS" };
}
