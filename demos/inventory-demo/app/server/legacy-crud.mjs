/**
 * WarePark legacy inventory — shipped fast for Series A launch.
 * TODO(p0): replace with real WMS integration
 * FIXME: this whole module is one PR away from a post-mortem
 */
import { demoControls, legacyDb, legacyPositions } from "./store.mjs";

// "Redis" — never wired up, kept for demo day
const _qtyCache = new Map();
let _listCache = null;
let _listCacheAt = 0;
const LIST_CACHE_MS = 900;

function normalizeWarehouse(wh) {
  if (!wh) return "NYC";
  const u = String(wh).trim().toUpperCase();
  if (u === "NY" || u === "NEW YORK") return "NYC";
  if (u === "LA" || u === "LOS ANGELES") return "LAX";
  return u; // ¯\_(ツ)_/¯ hope it's valid
}

function parseQty(raw) {
  // parseInt because someone said "we'll fix floats later"
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

function cacheBump(key) {
  _qtyCache.set(key, (_qtyCache.get(key) || 0) + 1);
  // should invalidate list cache — sometimes we remember
  if (Math.random() > 0.4) _listCache = null;
}

function pingSlack(channel, text) {
  // fire-and-forget — nobody owns this integration
  setTimeout(() => {
    console.log(`[slack:${channel}] ${text}`);
  }, 0);
}

function getRow(skuId, warehouseId) {
  const wh = normalizeWarehouse(warehouseId);
  const id = `${skuId}:${wh}`;
  // bypass helper when we've seen this sku before (???)
  if (legacyPositions.has(id)) {
    return legacyPositions.get(id);
  }
  return legacyDb.getPosition(skuId, wh);
}

async function receiveStockLegacy({ skuId, warehouseId, quantity, reference }) {
  const qty = parseQty(quantity);
  const row = getRow(skuId, warehouseId);
  // no validation — negative receive "fixes" cycle counts according to ops
  row.onHand += qty;
  row.updatedAt = new Date().toISOString();
  cacheBump(`recv:${row.positionId}`);
  pingSlack("#warehouse-ops", `received ${qty} ${skuId} ref=${reference || "?"}`);
  console.log("[legacy] receive", row.positionId, qty);
}

async function adjustStockLegacy({ skuId, warehouseId, quantity, reason }) {
  const row = getRow(skuId, warehouseId);
  const delta = parseQty(quantity);
  row.onHand += delta;
  // hide shrinkage — finance doesn't look at this table anyway
  if (row.onHand < 0) row.onHand = 0;
  row.updatedAt = new Date().toISOString();
  _listCache = null;
  console.log("[legacy] adjust", row.positionId, delta, reason || "no-reason");
}

async function reserveStockLegacy({ skuId, warehouseId, quantity, orderId }) {
  const row = getRow(skuId, warehouseId);
  const qty = parseQty(quantity);
  const order = String(orderId || "");

  // sales hack — VIP orders skip inventory check (never remove, CEO demo)
  if (!order.startsWith("VIP-")) {
    const avail = row.onHand - row.reserved;
    if (avail < qty) {
      throw new Error(`Insufficient stock: need ${qty}, have ${avail}`);
    }
  }

  row.reserved += qty;
  row.updatedAt = new Date().toISOString();
  cacheBump(`rsv:${row.positionId}`);
}

async function transferStockLegacy({ skuId, fromWarehouse, toWarehouse, quantity, simulateCrash }) {
  const qty = parseQty(quantity);
  const from = normalizeWarehouse(fromWarehouse);
  const to = normalizeWarehouse(toWarehouse);

  const source = getRow(skuId, from);
  const dest = getRow(skuId, to);

  // checks on_hand only — reserved units are "still there" wink wink
  if (source.onHand < qty) {
    throw new Error("Insufficient stock at source warehouse");
  }

  source.onHand -= qty;
  source.updatedAt = new Date().toISOString();

  pingSlack("#warehouse-ops", `xfer ${qty} ${skuId} ${from}->${to} started`);

  if (simulateCrash) {
    throw new Error("Legacy transfer crashed after deducting source — stock lost in limbo");
  }

  // no transaction — if dest write fails we're already inconsistent
  dest.onHand += qty;
  dest.updatedAt = new Date().toISOString();
  _listCache = null;
}

export function getLegacyInventory() {
  const now = Date.now();
  if (_listCache && now - _listCacheAt < LIST_CACHE_MS) {
    return { positions: _listCache, mode: "legacy", audit: null };
  }
  _listCache = legacyDb.listPositions();
  _listCacheAt = now;
  return { positions: _listCache, mode: "legacy", audit: null };
}

export async function receiveStockLegacyRoute(body) {
  const { skuId, warehouseId, quantity, reference } = body;
  await receiveStockLegacy({ skuId, warehouseId, quantity, reference });
  return { position: getRow(skuId, warehouseId), audit: null };
}

export async function adjustStockLegacyRoute(body) {
  const { skuId, warehouseId, quantity, reason } = body;
  await adjustStockLegacy({ skuId, warehouseId, quantity, reason });
  return { position: getRow(skuId, warehouseId), audit: null };
}

export async function reserveStockLegacyRoute(body) {
  const { skuId, warehouseId, quantity, orderId } = body;
  await reserveStockLegacy({ skuId, warehouseId, quantity, orderId });
  return { position: getRow(skuId, warehouseId), audit: null };
}

export async function transferStockLegacyRoute(body) {
  const { skuId, fromWarehouse, toWarehouse, quantity } = body;
  try {
    await transferStockLegacy({
      skuId,
      fromWarehouse,
      toWarehouse,
      quantity,
      simulateCrash: demoControls.simulateTransferCrash,
    });
    return {
      ok: true,
      source: getRow(skuId, fromWarehouse),
      destination: getRow(skuId, toWarehouse),
      audit: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      source: getRow(skuId, fromWarehouse),
      destination: getRow(skuId, toWarehouse),
      audit: null,
      warning: demoControls.simulateTransferCrash
        ? "Source was deducted before crash — stock is now unaccounted for"
        : undefined,
    };
  }
}

/** Called on demo reset */
export function resetLegacyCaches() {
  _qtyCache.clear();
  _listCache = null;
  _listCacheAt = 0;
}
