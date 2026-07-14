import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  adjustStockLegacyRoute,
  getLegacyInventory,
  receiveStockLegacyRoute,
  reserveStockLegacyRoute,
  resetLegacyCaches,
  transferStockLegacyRoute,
} from "./legacy-crud.mjs";
import {
  adjustStockCauset,
  fetchInventorySnapshot,
  fetchMovements,
  receiveStockCauset,
  reserveStockCauset,
  transferStockCauset,
} from "./causet-inventory.mjs";
import { getCausetStatus } from "./causet-adapter.mjs";
import { attachSseClient, sseClientCount } from "./causet-stream.mjs";
import { getDemoControls, getSkus, getWarehouses, resetStore, setDemoControls } from "./store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3848);

const app = express();
app.use(express.json());

function causetErrorStatus(err) {
  const msg = err.message || "";
  if (msg.includes("rejected") || msg.includes("INSUFFICIENT") || msg.includes("INVALID")) return 400;
  return 503;
}

// ── Shared metadata ──

app.get("/api/meta", (_req, res) => {
  res.json({ skus: getSkus(), warehouses: getWarehouses(), causet: getCausetStatus() });
});

app.post("/api/demo/reset", (_req, res) => {
  resetStore();
  resetLegacyCaches();
  res.json({
    ok: true,
    note: "Legacy store reset. Causet fork state is unchanged — stock and movements persist on the runtime.",
  });
});

app.get("/api/demo/controls", (_req, res) => res.json(getDemoControls()));
app.post("/api/demo/controls", (req, res) => res.json(setDemoControls(req.body || {})));

// ── Inventory (legacy CRUD vs Causet retrofit) ──

app.get("/api/legacy/inventory", (_req, res) => {
  res.json(getLegacyInventory());
});

app.get("/api/causet/stream", (req, res) => {
  attachSseClient(req, res);
});

app.get("/api/causet/stream/status", (_req, res) => {
  res.json({ clients: sseClientCount(), streamId: getCausetStatus().streamId });
});

app.get("/api/causet/inventory", async (_req, res) => {
  try {
    res.json(await fetchInventorySnapshot());
  } catch (e) {
    res.status(causetErrorStatus(e)).json({ error: e.message });
  }
});

app.get("/api/causet/movements/:positionId", async (req, res) => {
  try {
    res.json({ movements: await fetchMovements(req.params.positionId) });
  } catch (e) {
    res.status(causetErrorStatus(e)).json({ error: e.message });
  }
});

app.post("/api/legacy/receive", async (req, res) => {
  try {
    res.json(await receiveStockLegacyRoute(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/causet/receive", async (req, res) => {
  try {
    res.json(await receiveStockCauset(req.body));
  } catch (e) {
    res.status(causetErrorStatus(e)).json({ error: e.message });
  }
});

app.post("/api/legacy/adjust", async (req, res) => {
  try {
    res.json(await adjustStockLegacyRoute(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/causet/adjust", async (req, res) => {
  try {
    res.json(await adjustStockCauset(req.body));
  } catch (e) {
    res.status(causetErrorStatus(e)).json({ error: e.message });
  }
});

app.post("/api/legacy/reserve", async (req, res) => {
  try {
    res.json(await reserveStockLegacyRoute(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/causet/reserve", async (req, res) => {
  try {
    res.json(await reserveStockCauset(req.body));
  } catch (e) {
    res.status(causetErrorStatus(e)).json({ error: e.message });
  }
});

app.post("/api/legacy/transfer", async (req, res) => {
  const result = await transferStockLegacyRoute(req.body);
  res.status(result.ok ? 200 : 409).json(result);
});

app.post("/api/causet/transfer", async (req, res) => {
  try {
    res.json(await transferStockCauset(req.body));
  } catch (e) {
    res.status(causetErrorStatus(e)).json({ error: e.message });
  }
});

// ── SPA ──

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => {
  console.log(`
  {{templateName}} — {{projectName}}
  ───────────────────────
  Dashboard: http://localhost:${PORT}
  Legacy:    in-memory CRUD (stale cache demo)
  Causet:    ${process.env.CAUSET_PLATFORM || "test-platform"}/${process.env.CAUSET_APPLICATION || "{{packageName}}"} @ ${process.env.CAUSET_FORK || "{{causetFork}}"}
  `);
});
