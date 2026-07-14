/**
 * Wallets demo — composition root.
 *
 *   ui/  →  domain/  →  causet/ (@causet/sdk)  →  Causet runtime + realtime
 *
 * Run:  npm run dev   →  http://localhost:3850
 */

import { hydrateConfigFromServer } from "./causet/config.js";
import { CausetDemoClient } from "./causet/client.js";
import { WalletStore } from "./domain/store.js";
import { createEventHandler } from "./domain/events.js";
import { WalletService } from "./domain/service.js";
import {
  createRenderer,
  log,
  setBadge,
  setBusy,
  setFlow,
  setSectionsLoading,
  showToast,
} from "./ui/render.js";
import { bindControls } from "./ui/bind.js";
import { bindIntro } from "./ui/intro.js";

await hydrateConfigFromServer();
bindIntro();

const causet = new CausetDemoClient();
const store = new WalletStore();

let refreshTimer = null;
let autoRefreshTimer = null;

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    try {
      await service.refreshOnce();
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { service.refreshOnce().catch(() => {}); }, 400);
    } catch (e) {
      log("error", e.message, true);
    }
  }, 150);
}

const ui = {
  setBusy,
  setBadge,
  setFlow,
  setSectionsLoading,
  renderTables: createRenderer(store),
  showToast,
  log,
  scheduleRefresh,
  paintNow: () => service.paintNow(),
};

const events = createEventHandler(store, ui);
const service = new WalletService(causet, store, events, ui);

function startAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    service.refreshOnce({ silent: true }).catch(() => {});
  }, 4000);
}

async function ensureLive() {
  causet.createSdk();
  setBadge("", "Loading…");
  startAutoRefresh();

  // Queries use platform/app slugs — paint balances immediately.
  // SSE needs resolveIds + realtime StreamExists (can be slow) — do it in parallel.
  const tables = service.refreshOnce().then(() => {
    setBadge("live", "Connected");
  });

  const live = causet
    .connectLive({
      onDomainEvent: (d) => events.noteDomainEvent(d.type, d.entity, d.payload || {}),
      onPatch: () => scheduleRefresh(),
      onStatus: setBadge,
      onLog: log,
    })
    .then((ok) => {
      if (ok) setBadge("live", "SSE live");
      return ok;
    })
    .catch((e) => {
      log("error", `SSE: ${e.message}`, true);
      return false;
    });

  await tables;
  void live;
}

bindControls(service, {
  onPing: () => service.withBusy(async () => {
    await ensureLive();
    log("api", "Refreshed + SSE reconnected (@causet/sdk)");
  }),
});

ensureLive().catch((e) => {
  setBadge("err", "Unreachable");
  log("error", e.message, true);
});

window.addEventListener("beforeunload", () => {
  causet.destroy();
  clearInterval(autoRefreshTimer);
  clearTimeout(refreshTimer);
});
