const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let mode = "legacy";
let meta = { skus: [], warehouses: [] };
let pollTimer = null;
let lastSnapshot = new Map();
let activeModal = null;
/** @type {EventSource | null} */
let causetStream = null;
let refreshDebounce = null;
const liveFeed = [];
const MAX_FEED = 24;

const MODALS = {
  receive: { title: "Receive stock", formId: "form-receive" },
  reserve: { title: "Purchase / reserve", formId: "form-reserve" },
  adjust: { title: "Adjust stock", formId: "form-adjust" },
  transfer: { title: "Transfer stock", formId: "form-transfer" },
};

const POLL_MS = 1200;
const TOAST_MS = 4200;

const CODE = {
  legacy: `// legacy/before-causet.ts — Series A speed-run
async function transferStockLegacy(db, input) {
  const source = db.getPosition(input.skuId, input.from);
  // FIXME: checks on_hand, not available
  if (source.onHand < input.qty) throw new Error("nope");

  source.onHand -= input.qty;  // committed immediately
  if (crash) throw new Error("502 from carrier API");

  db.getPosition(input.skuId, input.to).onHand += input.qty;
  // no txn · no audit · stale list cache · VIP orders skip checks
}`,
  causet: `// legacy/after-causet.ts — one intent, Causet owns the rest
async function transferStockModernized(input) {
  return submitInventoryIntent("TRANSFER_STOCK",
    \`\${input.skuId}:\${input.fromWarehouse}\`, {
      sku_id: input.skuId,
      from_warehouse: input.from,
      to_warehouse: input.to,
      quantity: input.qty,
    });
  // preflight rules · atomic submit · movement timeline
  // live stream: SDK WebSocket → SSE → UI
}`,
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setStreamStatus(state, label) {
  const bar = $("#stream-status");
  const dot = $("#stream-dot");
  const text = $("#stream-label");
  if (!bar || !dot || !text) return;
  bar.className = `stream-status causet-only ${state}`;
  text.textContent = label;
}

function pushLiveFeed(type, data) {
  const feed = $("#live-feed");
  if (!feed) return;
  feed.hidden = false;

  let detail = type;
  if (type === "intent_progress" && data.sseEvent) detail = `${type}:${data.sseEvent}`;
  if (type === "stream_event" && data.event?.type) detail = `stream:${data.event.type}`;
  if (type === "emitted" && data.emits?.length) detail = `emitted:${data.emits.length}`;

  liveFeed.unshift({ type: detail, at: new Date().toLocaleTimeString() });
  if (liveFeed.length > MAX_FEED) liveFeed.length = MAX_FEED;

  feed.innerHTML = liveFeed.map((row) =>
    `<div class="feed-row"><strong>${esc(row.type)}</strong> · ${esc(row.at)}</div>`
  ).join("");
}

function scheduleRefresh() {
  clearTimeout(refreshDebounce);
  refreshDebounce = setTimeout(() => refresh().catch(() => {}), 200);
}

function connectCausetStream() {
  disconnectCausetStream();
  setStreamStatus("", "Connecting…");

  causetStream = new EventSource("/api/causet/stream");

  causetStream.addEventListener("bridge_ready", () => {
    setStreamStatus("live", "Live — inventory_position_stream");
  });
  causetStream.addEventListener("stream_connected", () => {
    setStreamStatus("live", "Live — WebSocket connected");
  });
  causetStream.addEventListener("bridge_error", (e) => {
    try {
      const data = JSON.parse(e.data);
      setStreamStatus("err", data.error || "Bridge error");
    } catch {
      setStreamStatus("err", "Bridge error");
    }
  });

  for (const type of [
    "stream_event", "entity_state", "emitted", "patch_op", "intent_complete",
  ]) {
    causetStream.addEventListener(type, (e) => {
      try {
        pushLiveFeed(type, JSON.parse(e.data));
      } catch { /* ignore */ }
      scheduleRefresh();
    });
  }

  for (const type of ["intent_start", "intent_progress"]) {
    causetStream.addEventListener(type, (e) => {
      try {
        pushLiveFeed(type, JSON.parse(e.data));
      } catch { /* ignore */ }
    });
  }

  causetStream.onerror = () => {
    setStreamStatus("err", "SSE disconnected — retrying via poll");
  };
}

function disconnectCausetStream() {
  causetStream?.close();
  causetStream = null;
  liveFeed.length = 0;
  const feed = $("#live-feed");
  if (feed) {
    feed.hidden = true;
    feed.innerHTML = "";
  }
}

function setMode(next) {
  mode = next;
  closeModal();
  lastSnapshot.clear();
  document.body.className = `${next}-mode`;
  $$(".mode-btn").forEach((b) => b.classList.toggle("active", b.dataset.mode === next));
  $("#mode-banner").className = `banner ${next}`;
  $("#mode-banner").innerHTML = next === "legacy"
    ? "<strong>Legacy v0</strong> — Series A CRUD: stale cache, VIP bypasses, transfer checks on_hand not available, adjust clamps shrinkage to zero."
    : (() => {
        const target = meta.causet?.application
          ? `${meta.causet.application} @ ${meta.causet.forkId}`
          : "sandbox-inv @ sandbox";
        return `<strong>Causet retrofit</strong> — <code>${esc(target)}</code>. Intents + projection queries (SSE fan-out).`;
      })();
  $("#code-sample").textContent = CODE[next];
  if (next === "causet") connectCausetStream();
  else disconnectCausetStream();
  refresh();
  startPolling();
}

function showToast(ok, msg) {
  const stack = $("#toast-stack");
  if (!stack) return;

  const toast = document.createElement("div");
  toast.className = `toast ${ok ? "ok" : "err"}`;
  toast.innerHTML = `
    <span class="toast-icon">${ok ? "✓" : "✕"}</span>
    <span class="toast-body">${esc(msg)}</span>
    <button type="button" class="toast-close" aria-label="Dismiss">×</button>`;

  const dismiss = () => {
    if (toast.classList.contains("leaving")) return;
    toast.classList.add("leaving");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  toast.querySelector(".toast-close").addEventListener("click", dismiss);
  stack.appendChild(toast);

  const max = 4;
  while (stack.children.length > max) {
    stack.firstElementChild?.remove();
  }

  setTimeout(dismiss, TOAST_MS);
}

function positionKey(p) {
  return `${p.positionId}:${p.onHand}:${p.reserved}:${p.available}`;
}

function openModal(key) {
  const cfg = MODALS[key];
  if (!cfg) return;

  activeModal = key;
  $("#modal-title").textContent = cfg.title;
  $$(".modal-pane").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== key;
  });

  const overlay = $("#modal-overlay");
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  const form = document.getElementById(cfg.formId);
  form?.querySelector("input, select, button")?.focus();
}

function closeModal() {
  activeModal = null;
  const overlay = $("#modal-overlay");
  overlay.hidden = true;
  overlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  $$(".modal-pane").forEach((pane) => { pane.hidden = true; });
}

function buildForms() {
  const skuOpts = meta.skus.map((s) => `<option value="${esc(s.id)}">${esc(s.id)} — ${esc(s.name)}</option>`).join("");
  const whOpts = meta.warehouses.map((w) => `<option value="${esc(w)}">${esc(w)}</option>`).join("");

  const fields = (extra = "") => `
    <label>SKU</label><select name="skuId" required>${skuOpts}</select>
    <label>Warehouse</label><select name="warehouseId" required>${whOpts}</select>
    ${extra}
    <button class="btn btn-primary" type="submit">Submit</button>`;

  $("#form-receive").innerHTML = fields(`
    <label>Quantity</label><input name="quantity" type="number" min="1" value="10" required>
    <label>Reference</label><input name="reference" value="PO-4421" />
  `);
  $("#form-reserve").innerHTML = fields(`
    <label>Purchase quantity</label><input name="quantity" type="number" min="1" value="5" required>
    <label>Order ID</label><input name="orderId" value="ORD-7781" />
  `);
  $("#form-adjust").innerHTML = fields(`
    <label>Delta (+/-)</label><input name="quantity" type="number" value="-2" required>
    <label>Reason</label><input name="reason" value="cycle-count" />
  `);
  $("#form-transfer").innerHTML = `
    <label>SKU</label><select name="skuId" required>${skuOpts}</select>
    <label>From</label><select name="fromWarehouse" required>${whOpts}</select>
    <label>To</label><select name="toWarehouse" required>${whOpts}</select>
    <label>Quantity</label><input name="quantity" type="number" min="1" value="10" required>
    <button class="btn btn-primary" type="submit">Transfer</button>`;

  $$(".form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = Object.fromEntries(fd.entries());
      body.quantity = Number(body.quantity);
      const btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;
      try {
        await saveControls();
        const result = await postAction(
          form.id === "form-receive" ? "receive"
            : form.id === "form-reserve" ? "reserve"
            : form.id === "form-adjust" ? "adjust"
            : "transfer",
          body
        );
        showToast(true, actionLabel(form.id) + " completed");
        closeModal();
        await refresh();
      } catch (err) {
        const extra = err.data?.warning ? ` — ${err.data.warning}` : "";
        showToast(false, err.message + extra);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  });
}

function actionLabel(formId) {
  return {
    "form-receive": "Receive stock",
    "form-reserve": "Purchase reserved",
    "form-adjust": "Adjust stock",
    "form-transfer": "Transfer",
  }[formId] || "Operation";
}

async function postAction(action, body) {
  const prefix = mode === "legacy" ? "/api/legacy" : "/api/causet";
  const res = await fetch(`${prefix}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.data = data;
    throw err;
  }
  if (data.ok === false) {
    const err = new Error(data.error || "Request failed");
    err.data = data;
    throw err;
  }
  return data;
}

async function saveControls() {
  await api("/api/demo/controls", {
    method: "POST",
    body: { simulateTransferCrash: $("#crash-transfer").checked },
  });
}

async function refresh() {
  const prefix = mode === "legacy" ? "/api/legacy" : "/api/causet";
  const data = await api(`${prefix}/inventory`);
  const positions = data.positions || [];

  const rows = positions.map((p) => {
    const key = p.positionId;
    const snap = positionKey(p);
    const changed = lastSnapshot.has(key) && lastSnapshot.get(key) !== snap;
    lastSnapshot.set(key, snap);
    return `
    <tr class="${changed ? "row-flash" : ""}" data-position="${esc(key)}">
      <td><strong>${esc(p.skuId)}</strong><br><span style="color:var(--muted);font-size:11px">${esc(p.skuName)}</span></td>
      <td>${esc(p.warehouseId)}</td>
      <td>${p.onHand}</td>
      <td>${p.reserved}</td>
      <td>${p.available}</td>
      <td>${p.lowStock ? '<span class="badge low">Low</span>' : '<span class="badge ok">OK</span>'}</td>
    </tr>`;
  }).join("");

  $("#inventory-body").innerHTML = rows || '<tr><td colspan="6" class="empty">No stock</td></tr>';

  const tl = $("#timeline");
  if (mode === "legacy") {
    tl.innerHTML = '<div class="empty">No movement history in legacy mode</div>';
  } else {
    const movements = data.movements || [];
    tl.innerHTML = movements.length
      ? movements.slice().reverse().map((m) => `
        <div class="tl-row">
          <div class="type">${esc(m.movementType)} · ${esc(m.skuId)} @ ${esc(m.warehouseId)}</div>
          <div class="meta">qty ${m.quantity > 0 ? "+" : ""}${m.quantity} → balance ${m.balanceAfter} · ${esc(m.reference || "")}</div>
        </div>`).join("")
      : '<div class="empty">Movements appear here after the first intent</div>';
  }
}

function startPolling() {
  stopPolling();
  const ms = mode === "legacy" ? POLL_MS : POLL_MS * 5;
  pollTimer = setInterval(() => refresh().catch(() => {}), ms);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

$$("#mode-toggle .mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setMode(btn.dataset.mode));
});

$$("[data-open-modal]").forEach((btn) => {
  btn.addEventListener("click", () => openModal(btn.dataset.openModal));
});

$$("[data-close-modal]").forEach((el) => {
  el.addEventListener("click", closeModal);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && activeModal) closeModal();
});

$("#crash-transfer")?.addEventListener("change", saveControls);
$("#reset-demo")?.addEventListener("click", async () => {
  await api("/api/demo/reset", { method: "POST" });
  $("#crash-transfer").checked = false;
  lastSnapshot.clear();
  showToast(true, "Demo reset — seed data restored");
  await refresh();
});

(async () => {
  meta = await api("/api/meta");
  buildForms();
  setMode("legacy");
})();
