/**
 * Poll projection queries until a predicate passes (eventual consistency).
 */

import { cell, walletBalanceOf } from "../causet/format.js";

/**
 * @param {() => Promise<{ wallets: object[], moves: object[] }>} refreshFn
 * @param {(data: { wallets: object[], moves: object[] }) => boolean | Promise<boolean>} predicate
 */
export async function waitUntil(refreshFn, predicate, { tries = 16, delayMs = 300 } = {}) {
  for (let i = 0; i < tries; i++) {
    const data = await refreshFn();
    if (await predicate(data)) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

export function waitForWallet(store, refreshFn, walletId, opts) {
  const id = String(walletId || "").trim();
  if (!id) return Promise.resolve(false);
  return waitUntil(refreshFn, (data) => {
    const hit = (data?.wallets || []).some(
      (r) => String(cell(r, "wallet_balances.wallet_id", "wallet_id")) === id
    );
    if (hit) store.walletOverlay.delete(id);
    return hit;
  }, opts);
}

export function waitForWalletBalance(store, refreshFn, walletId, expectBalance, opts) {
  const id = String(walletId || "").trim();
  const expect = Number(expectBalance);
  if (!id || !Number.isFinite(expect)) return Promise.resolve(false);
  return waitUntil(refreshFn, (data) => {
    const row = (data?.wallets || []).find(
      (r) => String(cell(r, "wallet_balances.wallet_id", "wallet_id")) === id
    );
    if (!row) return false;
    const bal = walletBalanceOf(row);
    if (bal === expect) {
      store.walletOverlay.delete(id);
      return true;
    }
    return false;
  }, opts);
}

export function waitForMovement(store, refreshFn, movementId, opts) {
  const id = String(movementId || "").trim();
  if (!id) return Promise.resolve(false);
  return waitUntil(refreshFn, (data) => {
    const hit = (data?.moves || []).some(
      (r) => String(cell(r, "ledger_movements.movement_id", "movement_id")) === id
    );
    if (hit) store.moveOverlay.delete(id);
    return hit;
  }, opts);
}

export function waitForTransfer(store, refreshFn, transferId, opts = {}) {
  const id = String(transferId || "").trim();
  if (!id) return Promise.resolve(false);
  return waitUntil(refreshFn, (data) => {
    const hits = (data?.moves || []).filter(
      (r) => String(cell(r, "ledger_movements.transfer_id", "transfer_id")) === id
    );
    if (hits.length >= 2) {
      for (const [mid, o] of [...store.moveOverlay]) {
        if (String(o["ledger_movements.transfer_id"]) === id) store.moveOverlay.delete(mid);
      }
      return true;
    }
    return false;
  }, { tries: 20, delayMs: 300, ...opts });
}
