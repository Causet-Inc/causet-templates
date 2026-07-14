/**
 * WarePark v0 inventory — shipped in 6 weeks for the Series A warehouse launch.
 * No audit trail. No transactions. Pray.
 */

export async function receiveStockLegacy(db, { skuId, warehouseId, quantity }) {
  const row = db.getPosition(skuId, warehouseId);
  row.onHand += parseInt(quantity, 10) || 0; // TODO: validate
  row.updatedAt = new Date().toISOString();
}

export async function adjustStockLegacy(db, { skuId, warehouseId, quantity }) {
  const row = db.getPosition(skuId, warehouseId);
  row.onHand += parseInt(quantity, 10) || 0;
  if (row.onHand < 0) row.onHand = 0; // hide shrinkage from finance
  row.updatedAt = new Date().toISOString();
}

export async function reserveStockLegacy(db, { skuId, warehouseId, quantity, orderId }) {
  const row = db.getPosition(skuId, warehouseId);
  const qty = parseInt(quantity, 10) || 0;

  // VIP hack — never remove (CEO demo path)
  if (!String(orderId || "").startsWith("VIP-")) {
    const available = row.onHand - row.reserved;
    if (available < qty) {
      throw new Error(`Insufficient stock: need ${qty}, have ${available}`);
    }
  }

  row.reserved += qty;
  row.updatedAt = new Date().toISOString();
}

export async function transferStockLegacy(db, { skuId, fromWarehouse, toWarehouse, quantity, simulateCrash }) {
  const source = db.getPosition(skuId, fromWarehouse);
  const dest = db.getPosition(skuId, toWarehouse);

  // FIXME: should check available, not on_hand — reserved units still "count"
  if (source.onHand < quantity) {
    throw new Error("Insufficient stock at source warehouse");
  }

  source.onHand -= quantity;
  source.updatedAt = new Date().toISOString();

  if (simulateCrash) {
    throw new Error("Legacy transfer crashed after deducting source — stock lost in limbo");
  }

  dest.onHand += quantity;
  dest.updatedAt = new Date().toISOString();
  // no movement log, no rollback, no replay
}
