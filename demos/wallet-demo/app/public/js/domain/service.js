/**
 * Wallet domain service — business flows over Causet intents + projections.
 *
 * Intent map (see causet/actions/wallet.actions.causet):
 *   OPEN_WALLET / FUND_WALLET / WITHDRAW_WALLET  → wallet_stream
 *   TRANSFER_START                                → transfer_stream (commit envelope)
 *
 * Queries (see causet/queries/):
 *   list_wallets · list_recent_movements
 */

import { cents, mid, queryRows, cell, walletBalanceOf } from "../causet/format.js";
import {
  waitForMovement,
  waitForTransfer,
  waitForWallet,
  waitForWalletBalance,
} from "./wait.js";

export class WalletService {
  /**
   * @param {import("../causet/client.js").CausetClient} client
   * @param {import("./store.js").WalletStore} store
   * @param {ReturnType<import("./events.js").createEventHandler>} events
   * @param {{
   *   setBusy?: (on: boolean) => void,
   *   setBadge?: (state: string, label: string) => void,
   *   setFlow?: (s: string) => void,
   *   setSectionsLoading?: (on: boolean) => void,
   *   renderTables?: (wb: object[], mb: object[]) => void,
   *   showToast?: (title: string, body: string, kind?: string) => void,
   *   log?: (type: string, msg: string, isErr?: boolean) => void,
   *   scheduleRefresh?: () => void,
   * }} ui
   */
  constructor(client, store, events, ui) {
    this.client = client;
    this.store = store;
    this.events = events;
    this.ui = ui;
    this.busy = false;
    this.refreshInflight = 0;
  }

  async snapshotWallets() {
    try {
      const w = await this.client.runQuery("list_wallets");
      const map = new Map();
      for (const r of queryRows(w)) {
        const id = String(cell(r, "wallet_balances.wallet_id", "wallet_id"));
        if (!id || id === "—") continue;
        map.set(id, {
          owner: String(cell(r, "wallet_balances.owner", "owner") || ""),
          status: String(cell(r, "wallet_balances.status", "status") || "open"),
          balance: walletBalanceOf(r),
          row: r,
        });
      }
      for (const [id, o] of this.store.walletOverlay) {
        map.set(id, {
          owner: o.owner,
          status: o.status,
          balance: Number(o.balance) || 0,
          row: null,
        });
      }
      return map;
    } catch {
      const map = new Map();
      for (const [id, o] of this.store.walletOverlay) {
        map.set(id, { owner: o.owner, status: o.status, balance: Number(o.balance) || 0, row: null });
      }
      return map;
    }
  }

  /** @param {{ silent?: boolean }} [opts] */
  async refreshOnce(opts = {}) {
    const showSpinner = !opts.silent;
    if (showSpinner) {
      this.refreshInflight += 1;
      this.ui.setSectionsLoading?.(true);
    }
    try {
      const [w, m] = await Promise.all([
        this.client.runQuery("list_wallets"),
        this.client.runQuery("list_recent_movements"),
      ]);
      const wb = queryRows(w);
      const mb = queryRows(m);
      this.ui.renderTables?.(wb, mb);
      this.events.settlePendingFromMovements(mb);
      return { wallets: wb, moves: mb };
    } finally {
      if (showSpinner) {
        this.refreshInflight = Math.max(0, this.refreshInflight - 1);
        if (this.refreshInflight === 0) this.ui.setSectionsLoading?.(false);
      }
    }
  }

  async paintNow() {
    try {
      const [w, m] = await Promise.all([
        this.client.runQuery("list_wallets"),
        this.client.runQuery("list_recent_movements"),
      ]);
      this.ui.renderTables?.(queryRows(w), queryRows(m));
    } catch {
      this.ui.renderTables?.([], []);
    }
  }

  silentRefresh = () => this.refreshOnce({ silent: true });

  async withBusy(fn) {
    if (this.busy) {
      this.ui.log?.("error", "Wait for the current action to finish", true);
      return;
    }
    this.busy = true;
    this.ui.setBusy?.(true);
    try {
      await fn();
    } catch (e) {
      this.ui.log?.("error", e.message, true);
      this.ui.showToast?.("Action failed", e.message, "err");
      this.ui.setBadge?.("err", "Rejected");
    } finally {
      this.busy = false;
      this.ui.setBusy?.(false);
      try {
        await this.refreshOnce();
        this.ui.scheduleRefresh?.();
      } catch {
        this.ui.scheduleRefresh?.();
      }
    }
  }

  openWallet(walletId, owner) {
    return this.withBusy(async () => {
      const id = walletId.trim();
      this.ui.log?.("intent", `OPEN_WALLET · ${id}`);
      await this.client.executeIntent("wallet_stream", id, "OPEN_WALLET", {
        wallet_id: id,
        owner,
        currency: "USD",
      });
      this.ui.setBadge?.("live", "Connected");
      this.store.rememberWallet(id, owner, "open", 0);
      this.store.toastedWalletEvents.add(`open:${id}`);
      this.ui.showToast?.("Wallet opened", `${id} · ${owner} · $0.00`, "ok");
      await this.paintNow();
      await waitForWallet(this.store, this.silentRefresh, id);
    });
  }

  fundWallet(walletId, amount, reference) {
    return this.withBusy(async () => {
      const id = walletId.trim();
      const amt = Number(amount);
      const movementId = mid("fund");
      const snap = await this.snapshotWallets();
      const before = snap.get(id);
      const nextBal = (before?.balance || 0) + amt;

      this.ui.log?.("intent", `FUND_WALLET · ${id}`);
      await this.client.executeIntent("wallet_stream", id, "FUND_WALLET", {
        wallet_id: id,
        amount: amt,
        reference,
        movement_id: movementId,
      });
      this.ui.setBadge?.("live", "Connected");

      this.store.rememberWallet(id, before?.owner || "", before?.status || "open", nextBal, nextBal);
      this.store.rememberMovement({
        movementId,
        walletId: id,
        movementType: "WALLET_FUNDED",
        amount: amt,
        balanceAfter: nextBal,
      });
      this.store.toastedWalletEvents.add(`fund:${id}:${movementId}`);
      this.ui.showToast?.("Wallet funded", `${id} · ${cents(amt)}`, "ok");
      await this.paintNow();
      await Promise.all([
        waitForWalletBalance(this.store, this.silentRefresh, id, nextBal),
        waitForMovement(this.store, this.silentRefresh, movementId),
      ]);
    });
  }

  withdrawWallet(walletId, amount, reference) {
    return this.withBusy(async () => {
      const id = walletId.trim();
      const amt = Number(amount);
      const movementId = mid("wd");
      const snap = await this.snapshotWallets();
      const before = snap.get(id);
      const nextBal = (before?.balance || 0) - amt;

      this.ui.log?.("intent", `WITHDRAW_WALLET · ${id}`);
      await this.client.executeIntent("wallet_stream", id, "WITHDRAW_WALLET", {
        wallet_id: id,
        amount: amt,
        reference,
        movement_id: movementId,
      });
      this.ui.setBadge?.("live", "Connected");

      this.store.rememberWallet(id, before?.owner || "", before?.status || "open", nextBal, nextBal);
      this.store.rememberMovement({
        movementId,
        walletId: id,
        movementType: "WALLET_WITHDRAWN",
        amount: amt,
        balanceAfter: nextBal,
      });
      this.store.toastedWalletEvents.add(`wd:${id}:${movementId}`);
      this.ui.showToast?.("Wallet withdrawn", `${id} · ${cents(amt)}`, "ok");
      await this.paintNow();
      await Promise.all([
        waitForWalletBalance(this.store, this.silentRefresh, id, nextBal),
        waitForMovement(this.store, this.silentRefresh, movementId),
      ]);
    });
  }

  transfer(fromWallet, toWallet, amount) {
    return this.withBusy(async () => {
      const from = fromWallet.trim();
      const to = toWallet.trim();
      const amt = Number(amount);
      const snap = await this.snapshotWallets();

      try {
        this.ui.log?.("intent", `OPEN_WALLET · ${to} (ensure dest)`);
        await this.client.executeIntent("wallet_stream", to, "OPEN_WALLET", {
          wallet_id: to,
          owner: to.replace(/^wallet-/, ""),
          currency: "USD",
        });
        if (!snap.has(to)) {
          this.store.rememberWallet(to, to.replace(/^wallet-/, ""), "open", 0);
          snap.set(to, { owner: to.replace(/^wallet-/, ""), status: "open", balance: 0, row: null });
          await this.paintNow();
        }
      } catch {
        /* may already be open */
      }

      const transferId = mid("xfer");
      const seq = this.store.nextTransferSeq();
      const fromBefore = snap.get(from);
      const toBefore = snap.get(to);
      const fromNext = (fromBefore?.balance || 0) - amt;
      const toNext = (toBefore?.balance || 0) + amt;

      this.ui.setFlow?.("prepare");
      this.store.pendingTransfers.set(transferId, {
        from,
        to,
        amount: amt,
        fromNext,
        toNext,
        fromOwner: fromBefore?.owner || "",
        toOwner: toBefore?.owner || to.replace(/^wallet-/, ""),
      });
      this.ui.log?.("envelope", `TRANSFER_START ${from} → ${to} · ${amt}`);
      await this.client.executeIntent("transfer_stream", transferId, "TRANSFER_START", {
        transfer_id: transferId,
        envelope_id: transferId,
        seq,
        from_wallet_id: from,
        to_wallet_id: to,
        amount: amt,
        created_at: Date.now(),
      });
      this.ui.setBadge?.("live", "Connected");
      this.ui.setFlow?.("commit");
      this.ui.log?.("envelope", `Accepted ${transferId} — waiting for commit`);
      this.ui.showToast?.("Transfer started", `${from} → ${to} · ${cents(amt)}`, "ok");

      await waitForTransfer(this.store, this.silentRefresh, transferId);
      await Promise.all([
        waitForWalletBalance(this.store, this.silentRefresh, from, fromNext),
        waitForWalletBalance(this.store, this.silentRefresh, to, toNext),
      ]);
    });
  }
}
