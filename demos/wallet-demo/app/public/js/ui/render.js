/**
 * DOM rendering helpers — tables, toasts, activity log, connection badge.
 */

import { cell, cents, esc, whenFmt } from "../causet/format.js";

const $ = (id) => document.getElementById(id);

export function setBadge(state, label) {
  $("conn-badge").className = "badge " + (state || "");
  $("conn-label").textContent = label;
}

export function setBusy(on) {
  ["btn-open", "btn-fund", "btn-withdraw", "btn-transfer", "btn-ping"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = on;
  });
}

export function log(type, msg, isErr) {
  const box = $("log");
  if (box.querySelector(".empty")) box.innerHTML = "";
  const row = document.createElement("div");
  row.className = "log-entry" + (isErr ? " err" : "");
  row.innerHTML = `<span class="t">${new Date().toLocaleTimeString()} · ${type}</span><div>${esc(msg)}</div>`;
  box.prepend(row);
}

export function showToast(title, body, kind = "ok") {
  const host = $("toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `<div class="toast-title">${esc(title)}</div>${body ? `<div class="toast-body">${esc(body)}</div>` : ""}`;
  host.appendChild(el);
  const hide = () => {
    el.classList.add("out");
    setTimeout(() => el.remove(), 200);
  };
  el.addEventListener("click", hide);
  setTimeout(hide, 4500);
}

export function setFlow(active) {
  document.querySelectorAll(".flow .step").forEach((el) => {
    el.classList.toggle("on", el.dataset.s === active);
  });
}

export function setSectionsLoading(on) {
  for (const id of ["sec-wallets", "sec-moves"]) {
    const el = $(id);
    if (!el) continue;
    el.classList.toggle("is-loading", !!on);
    el.setAttribute("aria-busy", on ? "true" : "false");
  }
}

/**
 * @param {import("../domain/store.js").WalletStore} store
 */
export function createRenderer(store) {
  return function renderTables(wb, mb) {
    const wallets = store.mergeWallets(wb);
    $("wallets").innerHTML = wallets.length
      ? wallets.map((r) => `<tr>
          <td class="mono">${esc(cell(r, "wallet_balances.wallet_id", "wallet_id"))}</td>
          <td>${esc(cell(r, "wallet_balances.owner", "owner"))}</td>
          <td><span class="pill">${esc(cell(r, "wallet_balances.status", "status"))}</span></td>
          <td class="bal" style="font-size:1rem">${esc(cents(cell(r, "wallet_balances.balance", "balance")))}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="empty">No wallets yet.</td></tr>`;

    const moves = store.mergeMoves(mb);
    $("moves").innerHTML = moves.length
      ? moves.map((r) => `<tr>
          <td title="${esc(cell(r, "ledger_movements.recorded_at", "recorded_at"))}">${esc(whenFmt(cell(r, "ledger_movements.recorded_at", "recorded_at")))}</td>
          <td><span class="pill">${esc(cell(r, "ledger_movements.movement_type", "movement_type"))}</span></td>
          <td class="mono">${esc(cell(r, "ledger_movements.wallet_id", "wallet_id"))}</td>
          <td>${esc(cents(cell(r, "ledger_movements.amount", "amount")))}</td>
          <td>${esc(cents(cell(r, "ledger_movements.balance_after", "balance_after")))}</td>
          <td class="mono">${esc(cell(r, "ledger_movements.counterparty_wallet_id", "counterparty_wallet_id"))}</td>
          <td class="mono">${esc(cell(r, "ledger_movements.transfer_id", "transfer_id"))}</td>
        </tr>`).join("")
      : `<tr><td colspan="7" class="empty">No movements yet.</td></tr>`;
  };
}

export function readForm(ids) {
  const out = {};
  for (const id of ids) out[id] = $(id)?.value ?? "";
  return out;
}

export { $ };
