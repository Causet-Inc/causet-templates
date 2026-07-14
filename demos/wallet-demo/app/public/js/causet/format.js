/**
 * Shared helpers for Causet query rows and money display.
 */

export function queryRows(result) {
  return Array.isArray(result?.rows) ? result.rows
    : Array.isArray(result?.items) ? result.items
    : Array.isArray(result?.data) ? result.data : [];
}

export function cell(row, ...keys) {
  for (const k of keys) if (row[k] != null && row[k] !== "") return row[k];
  return "—";
}

export function cents(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  return (v / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function whenFmt(v) {
  if (v == null || v === "" || v === "—") return "—";
  const n = Number(v);
  let d;
  if (Number.isFinite(n) && n > 1e11) d = new Date(n);
  else if (Number.isFinite(n) && n > 1e9) d = new Date(n * 1000);
  else d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit",
  });
}

export function esc(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function mid(prefix) {
  return `${prefix}-${Date.now().toString(36)}`;
}

export function walletBalanceOf(row) {
  const v = Number(cell(row, "wallet_balances.balance", "balance"));
  return Number.isFinite(v) ? v : 0;
}
