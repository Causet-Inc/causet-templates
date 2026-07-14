/**
 * Map Causet domain events (from SSE) → UI feedback + optimistic store updates.
 */

import { cents } from "../causet/format.js";

/**
 * @param {import("./store.js").WalletStore} store
 * @param {{
 *   setFlow?: (s: string) => void,
 *   showToast?: (title: string, body: string, kind?: string) => void,
 *   log?: (type: string, msg: string, isErr?: boolean) => void,
 *   scheduleRefresh?: () => void,
 *   paintNow?: () => Promise<void>,
 * }} ui
 */
export function createEventHandler(store, ui) {
  function markTransferDone(transferId, status, detail) {
    const id = String(transferId || "").trim();
    if (!id) return;

    const meta = store.pendingTransfers.get(id);
    if (meta) store.pendingTransfers.delete(id);

    if (status === "committed") {
      ui.setFlow?.("ledger");
      if (meta && meta.fromNext != null && meta.toNext != null) {
        store.rememberWallet(meta.from, meta.fromOwner || "", "open", meta.fromNext, meta.fromNext);
        store.rememberWallet(meta.to, meta.toOwner || "", "open", meta.toNext, meta.toNext);
        store.rememberMovement({
          movementId: `${id}:out`,
          walletId: meta.from,
          counterparty: meta.to,
          movementType: "TRANSFER_COMMIT",
          amount: meta.amount,
          balanceAfter: meta.fromNext,
          transferId: id,
        });
        store.rememberMovement({
          movementId: `${id}:in`,
          walletId: meta.to,
          counterparty: meta.from,
          movementType: "TRANSFER_COMMIT",
          amount: meta.amount,
          balanceAfter: meta.toNext,
          transferId: id,
        });
        ui.paintNow?.().catch(() => {});
      }
      if (!store.toastedTransfers.has(id)) {
        store.toastedTransfers.add(id);
        const body = meta
          ? `${meta.from} → ${meta.to} · ${cents(meta.amount)}`
          : (detail || id);
        ui.showToast?.("Transfer completed", body, "ok");
        ui.log?.("envelope", `COMMITTED ${id}`);
      }
      ui.scheduleRefresh?.();
      return;
    }

    if (status === "aborted") {
      ui.setFlow?.("prepare");
      if (!store.toastedTransfers.has(`abort:${id}`)) {
        store.toastedTransfers.add(`abort:${id}`);
        ui.showToast?.("Transfer aborted", detail || id, "err");
        ui.log?.("envelope", `ABORTED ${id}${detail ? " · " + detail : ""}`, true);
      }
      ui.scheduleRefresh?.();
    }
  }

  function settlePendingFromMovements(mb) {
    if (!store.pendingTransfers.size) return;
    for (const [id] of [...store.pendingTransfers]) {
      const hits = mb.filter((r) => {
        const tid = r["ledger_movements.transfer_id"] ?? r.transfer_id;
        return String(tid) === id;
      });
      if (!hits.length) continue;
      const committed = hits.some((r) => {
        const t = String(r["ledger_movements.movement_type"] ?? r.movement_type ?? "");
        return /COMMIT/i.test(t);
      });
      if (committed || hits.length >= 2) markTransferDone(id, "committed");
    }
  }

  function noteDomainEvent(type, entity, data) {
    const t = String(type || "");
    const id = entity
      || data?.transfer_id
      || data?.payload?.transfer_id
      || data?.wallet_id
      || data?.payload?.wallet_id
      || data?.envelope_id
      || data?.payload?.envelope_id
      || "";

    if (/TRANSFER_COMMIT/i.test(t)) {
      const from = data?.from_wallet_id || data?.payload?.from_wallet_id;
      const to = data?.to_wallet_id || data?.payload?.to_wallet_id;
      const amount = data?.amount ?? data?.payload?.amount;
      const detail = from && to
        ? `${from} → ${to}${amount != null ? " · " + cents(amount) : ""}`
        : "";
      markTransferDone(id || data?.transfer_id, "committed", detail);
    } else if (/TRANSFER_ABORT/i.test(t)) {
      const reason = data?.reason || data?.payload?.reason || data?.abort_reason || "";
      markTransferDone(id, "aborted", reason);
    } else if (/TRANSFER_PREPARE/i.test(t) && !/PREPARED/i.test(t)) {
      ui.setFlow?.("prepare");
    } else if (/TRANSFER_PREPARED/i.test(t)) {
      ui.setFlow?.("commit");
    } else if (/WALLET_FUNDED/i.test(t)) {
      const key = `fund:${id}:${data?.movement_id || data?.payload?.movement_id || ""}`;
      if (!store.toastedWalletEvents.has(key)) {
        store.toastedWalletEvents.add(key);
        const amt = data?.amount ?? data?.payload?.amount;
        ui.showToast?.("Wallet funded", `${id || "wallet"}${amt != null ? " · " + cents(amt) : ""}`, "ok");
      }
      ui.scheduleRefresh?.();
    } else if (/WALLET_WITHDRAWN/i.test(t)) {
      const key = `wd:${id}:${data?.movement_id || data?.payload?.movement_id || ""}`;
      if (!store.toastedWalletEvents.has(key)) {
        store.toastedWalletEvents.add(key);
        const amt = data?.amount ?? data?.payload?.amount;
        ui.showToast?.("Wallet withdrawn", `${id || "wallet"}${amt != null ? " · " + cents(amt) : ""}`, "ok");
      }
      ui.scheduleRefresh?.();
    } else if (/WALLET_OPENED/i.test(t)) {
      const owner = data?.owner || data?.payload?.owner || "";
      store.rememberWallet(id, owner, data?.status || "open", data?.balance_after ?? 0);
      const key = `open:${id}`;
      if (!store.toastedWalletEvents.has(key)) {
        store.toastedWalletEvents.add(key);
        ui.showToast?.("Wallet opened", `${id}${owner ? " · " + owner : ""} · $0.00`, "ok");
      }
      ui.scheduleRefresh?.();
    }
  }

  return { noteDomainEvent, markTransferDone, settlePendingFromMovements };
}
