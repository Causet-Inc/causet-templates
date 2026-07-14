/**
 * Retrofitted inventory — app emits intents; Causet owns stock invariants + timeline.
 */

import { submitInventoryIntent } from "../server/causet-adapter.mjs";

export async function receiveStockModernized({ skuId, skuName, warehouseId, quantity, reference }) {
  return submitInventoryIntent("RECEIVE_STOCK", `${skuId}:${warehouseId}`, {
    sku_id: skuId,
    sku_name: skuName,
    warehouse_id: warehouseId,
    quantity,
    reference,
  });
}

export async function adjustStockModernized({ skuId, warehouseId, quantity, reason }) {
  return submitInventoryIntent("ADJUST_STOCK", `${skuId}:${warehouseId}`, {
    sku_id: skuId,
    warehouse_id: warehouseId,
    quantity,
    reason,
  });
}

export async function reserveStockModernized({ skuId, warehouseId, quantity, orderId }) {
  return submitInventoryIntent("RESERVE_STOCK", `${skuId}:${warehouseId}`, {
    sku_id: skuId,
    warehouse_id: warehouseId,
    quantity,
    order_id: orderId,
  });
}

export async function transferStockModernized({ skuId, skuName, fromWarehouse, toWarehouse, quantity, transferId }) {
  return submitInventoryIntent("TRANSFER_STOCK", `${skuId}:${fromWarehouse}`, {
    sku_id: skuId,
    sku_name: skuName,
    from_warehouse: fromWarehouse,
    to_warehouse: toWarehouse,
    quantity,
    transfer_id: transferId,
  });
}
