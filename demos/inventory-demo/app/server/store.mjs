const SKUS = [
  { id: "WIDGET-01", name: "Widget Pro", reorderPoint: 20 },
  { id: "CABLE-12", name: "USB-C Cable 2m", reorderPoint: 50 },
  { id: "PACK-99", name: "Starter Pack", reorderPoint: 10 },
];

const WAREHOUSES = ["NYC", "LAX"];

export const INVENTORY_SEED = [
  { skuId: "WIDGET-01", warehouseId: "NYC", onHand: 120, reserved: 15 },
  { skuId: "WIDGET-01", warehouseId: "LAX", onHand: 45, reserved: 0 },
  { skuId: "CABLE-12", warehouseId: "NYC", onHand: 300, reserved: 40 },
  { skuId: "CABLE-12", warehouseId: "LAX", onHand: 80, reserved: 10 },
  { skuId: "PACK-99", warehouseId: "NYC", onHand: 25, reserved: 5 },
  { skuId: "PACK-99", warehouseId: "LAX", onHand: 12, reserved: 0 },
];

function positionId(skuId, warehouseId) {
  return `${skuId}:${warehouseId}`;
}

function now() {
  return new Date().toISOString();
}

/** @type {Map<string, object>} */
export const legacyPositions = new Map();

/** @type {{ simulateTransferCrash: boolean }} */
export const demoControls = { simulateTransferCrash: false };

function skuMeta(skuId) {
  return SKUS.find((s) => s.id === skuId) ?? { id: skuId, name: skuId, reorderPoint: 0 };
}

function makePosition(seed) {
  const sku = skuMeta(seed.skuId);
  return {
    positionId: positionId(seed.skuId, seed.warehouseId),
    skuId: seed.skuId,
    skuName: sku.name,
    warehouseId: seed.warehouseId,
    onHand: seed.onHand,
    reserved: seed.reserved,
    reorderPoint: sku.reorderPoint,
    updatedAt: now(),
  };
}

function enrich(row) {
  return {
    ...row,
    available: row.onHand - row.reserved,
    lowStock: row.onHand - row.reserved <= row.reorderPoint,
  };
}

export function resetStore() {
  legacyPositions.clear();
  demoControls.simulateTransferCrash = false;
  for (const seed of INVENTORY_SEED) {
    const pos = makePosition(seed);
    legacyPositions.set(pos.positionId, { ...pos });
  }
}

resetStore();

export function getSkus() {
  return SKUS;
}

export function getWarehouses() {
  return WAREHOUSES;
}

export function getDemoControls() {
  return { ...demoControls };
}

export function setDemoControls(patch) {
  Object.assign(demoControls, patch);
  return getDemoControls();
}

/** Legacy CRUD store (in-memory only — Causet mode reads from runtime projections). */
export const legacyDb = {
  getPosition(skuId, warehouseId) {
    const id = positionId(skuId, warehouseId);
    if (!legacyPositions.has(id)) {
      const sku = skuMeta(skuId);
      legacyPositions.set(id, {
        positionId: id,
        skuId,
        skuName: sku.name,
        warehouseId,
        onHand: 0,
        reserved: 0,
        reorderPoint: sku.reorderPoint,
        updatedAt: now(),
      });
    }
    return legacyPositions.get(id);
  },
  listPositions() {
    return [...legacyPositions.values()].map(enrich).sort((a, b) => a.positionId.localeCompare(b.positionId));
  },
};

export { positionId, skuMeta };
