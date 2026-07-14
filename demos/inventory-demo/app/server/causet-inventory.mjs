import { submitIntentWithStream } from "./causet-stream.mjs";
import { getCausetStatus, runInventoryQuery } from "./causet-adapter.mjs";
import { INVENTORY_SEED, positionId, skuMeta } from "./store.mjs";

let seeded = false;

function mapPosition(row) {
  const onHand = Number(row.on_hand ?? 0);
  const reserved = Number(row.reserved ?? 0);
  const sku = skuMeta(row.sku_id);
  const reorderPoint = Number(row.reorder_point) || sku.reorderPoint;
  const available = Number(row.available ?? onHand - reserved);
  return {
    positionId: row.position_id,
    skuId: row.sku_id,
    skuName: row.sku_name || sku.name,
    warehouseId: row.warehouse_id,
    onHand,
    reserved,
    available,
    reorderPoint,
    lowStock: available <= reorderPoint,
    updatedAt: row.updated_at ? new Date(Number(row.updated_at)).toISOString() : null,
  };
}

function mapMovement(row) {
  return {
    id: `${row.position_id}:${row.movement_type}:${row.event_ts}`,
    positionId: row.position_id,
    skuId: row.sku_id,
    warehouseId: row.warehouse_id,
    movementType: row.movement_type,
    quantity: Number(row.quantity),
    balanceAfter: Number(row.balance_after),
    reference: row.reference || "",
    status: row.status || "succeeded",
    timestamp: row.event_ts ? new Date(Number(row.event_ts)).toISOString() : null,
  };
}

export async function ensureSeeded() {
  if (seeded) return;
  const { items } = await runInventoryQuery("inventory_levels", null, { limit: 1 });
  if (items?.length > 0) {
    seeded = true;
    return;
  }

  for (const seed of INVENTORY_SEED) {
    const sku = skuMeta(seed.skuId);
    await submitIntentWithStream("RECEIVE_STOCK", positionId(seed.skuId, seed.warehouseId), {
      sku_id: seed.skuId,
      sku_name: sku.name,
      warehouse_id: seed.warehouseId,
      quantity: seed.onHand,
      reference: "seed",
    });
    if (seed.reserved > 0) {
      await submitIntentWithStream("RESERVE_STOCK", positionId(seed.skuId, seed.warehouseId), {
        sku_id: seed.skuId,
        warehouse_id: seed.warehouseId,
        quantity: seed.reserved,
        order_id: "seed-reserve",
      });
    }
  }
  seeded = true;
}

export async function fetchInventorySnapshot() {
  await ensureSeeded();
  const [levels, movementsResult] = await Promise.all([
    runInventoryQuery("inventory_levels"),
    runInventoryQuery("all_movements"),
  ]);
  const positions = (levels.items || []).map(mapPosition);
  const movements = (movementsResult.items || []).map(mapMovement);
  return {
    positions,
    movements,
    mode: "causet",
    causet: getCausetStatus(),
  };
}

export async function fetchMovements(positionIdValue) {
  await ensureSeeded();
  const { items } = await runInventoryQuery("sku_movement_history", {
    position_id: positionIdValue,
  });
  return (items || []).map(mapMovement);
}

export async function receiveStockCauset({ skuId, skuName, warehouseId, quantity, reference }) {
  const causet = await submitIntentWithStream("RECEIVE_STOCK", positionId(skuId, warehouseId), {
    sku_id: skuId,
    sku_name: skuName || skuMeta(skuId).name,
    warehouse_id: warehouseId,
    quantity: Number(quantity),
    reference: reference || "",
  });
  return { causet };
}

export async function adjustStockCauset({ skuId, warehouseId, quantity, reason }) {
  const causet = await submitIntentWithStream("ADJUST_STOCK", positionId(skuId, warehouseId), {
    sku_id: skuId,
    warehouse_id: warehouseId,
    quantity: Number(quantity),
    reason: reason || "",
  });
  return { causet };
}

export async function reserveStockCauset({ skuId, warehouseId, quantity, orderId }) {
  const causet = await submitIntentWithStream("RESERVE_STOCK", positionId(skuId, warehouseId), {
    sku_id: skuId,
    warehouse_id: warehouseId,
    quantity: Number(quantity),
    order_id: orderId || "demo-order",
  });
  return { causet };
}

export async function transferStockCauset({ skuId, skuName, fromWarehouse, toWarehouse, quantity, transferId }) {
  const causet = await submitIntentWithStream("TRANSFER_STOCK", positionId(skuId, fromWarehouse), {
    sku_id: skuId,
    sku_name: skuName || skuMeta(skuId).name,
    from_warehouse: fromWarehouse,
    to_warehouse: toWarehouse,
    quantity: Number(quantity),
    transfer_id: transferId || `xfer_${Date.now()}`,
  });
  return { causet };
}
