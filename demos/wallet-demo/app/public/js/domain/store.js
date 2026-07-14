/**
 * Optimistic UI store — fills the gap between intent accept and projection catch-up.
 */

import { cell, walletBalanceOf } from "../causet/format.js";

export class WalletStore {
  constructor() {
    /** @type {Map<string, {wallet_id:string, owner:string, status:string, balance:number, expectBalance?:number}>} */
    this.walletOverlay = new Map();
    /** @type {Map<string, object>} */
    this.moveOverlay = new Map();
    /** @type {Map<string, {from:string,to:string,amount:number,fromNext?:number,toNext?:number,fromOwner?:string,toOwner?:string}>} */
    this.pendingTransfers = new Map();
    this.toastedTransfers = new Set();
    this.toastedWalletEvents = new Set();
    // Monotonic seq across reloads — wallet causal gates reject seq <= last_envelope_seq.
    this.transferSeq = Date.now();
  }

  nextTransferSeq() {
    return this.transferSeq++;
  }

  rememberWallet(walletId, owner, status = "open", balance = 0, expectBalance = null) {
    const id = String(walletId || "").trim();
    if (!id) return;
    const prev = this.walletOverlay.get(id);
    this.walletOverlay.set(id, {
      wallet_id: id,
      owner: String(owner || prev?.owner || ""),
      status,
      balance: Number(balance) || 0,
      expectBalance: expectBalance == null ? Number(balance) || 0 : Number(expectBalance),
    });
  }

  rememberMovement({
    movementId,
    walletId,
    counterparty = "",
    movementType,
    amount,
    balanceAfter,
    transferId = "",
  }) {
    const id = String(movementId || "").trim();
    if (!id) return;
    this.moveOverlay.set(id, {
      "ledger_movements.movement_id": id,
      "ledger_movements.wallet_id": walletId,
      "ledger_movements.counterparty_wallet_id": counterparty || "—",
      "ledger_movements.movement_type": movementType,
      "ledger_movements.amount": amount,
      "ledger_movements.balance_after": balanceAfter,
      "ledger_movements.transfer_id": transferId || "—",
      "ledger_movements.recorded_at": Date.now(),
    });
  }

  mergeWallets(wb) {
    const byId = new Map();
    for (const r of wb) {
      const id = String(cell(r, "wallet_balances.wallet_id", "wallet_id"));
      if (!id || id === "—") continue;
      byId.set(id, r);
    }
    for (const [id, o] of [...this.walletOverlay]) {
      const existing = byId.get(id);
      if (existing && o.expectBalance != null) {
        const projected = walletBalanceOf(existing);
        if (projected === Number(o.expectBalance)) {
          this.walletOverlay.delete(id);
          continue;
        }
      }
      if (existing) {
        byId.set(id, {
          ...existing,
          "wallet_balances.wallet_id": id,
          "wallet_balances.owner": o.owner || cell(existing, "wallet_balances.owner", "owner"),
          "wallet_balances.status": o.status || cell(existing, "wallet_balances.status", "status"),
          "wallet_balances.balance": o.balance,
        });
      } else {
        byId.set(id, {
          "wallet_balances.wallet_id": o.wallet_id,
          "wallet_balances.owner": o.owner,
          "wallet_balances.status": o.status,
          "wallet_balances.balance": o.balance,
        });
      }
    }
    return [...byId.values()];
  }

  mergeMoves(mb) {
    const byId = new Map();
    for (const r of mb) {
      const id = String(cell(r, "ledger_movements.movement_id", "movement_id"));
      if (id && id !== "—") {
        byId.set(id, r);
        if (this.moveOverlay.has(id)) this.moveOverlay.delete(id);
      }
    }
    for (const [id, o] of [...this.moveOverlay]) {
      const xfer = o["ledger_movements.transfer_id"];
      if (xfer) {
        const hit = mb.some((r) => String(cell(r, "ledger_movements.transfer_id", "transfer_id")) === String(xfer));
        if (hit) {
          this.moveOverlay.delete(id);
          continue;
        }
      }
      if (!byId.has(id)) byId.set(id, o);
    }
    const merged = [...byId.values()];
    merged.sort((a, b) => {
      const ta = Number(cell(a, "ledger_movements.recorded_at", "recorded_at")) || 0;
      const tb = Number(cell(b, "ledger_movements.recorded_at", "recorded_at")) || 0;
      return tb - ta;
    });
    return merged;
  }
}
