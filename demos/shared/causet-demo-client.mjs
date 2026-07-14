// node_modules/@causet/sdk-core/dist/emitter.js
var Emitter = class {
  handlers = /* @__PURE__ */ new Map();
  wildcard = /* @__PURE__ */ new Set();
  on(eventType, handler) {
    if (eventType === "*") {
      this.wildcard.add(handler);
      return () => this.wildcard.delete(handler);
    }
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, /* @__PURE__ */ new Set());
    }
    this.handlers.get(eventType).add(handler);
    return () => this.handlers.get(eventType)?.delete(handler);
  }
  emit(eventType, data = null) {
    for (const h of this.handlers.get(eventType) ?? []) {
      try {
        h(data);
      } catch {
      }
    }
    for (const h of this.wildcard) {
      try {
        h(eventType, data);
      } catch {
      }
    }
  }
};

// node_modules/@causet/sdk-core/dist/errors.js
var CausetError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CausetError";
  }
};
var CausetAuthError = class extends CausetError {
  constructor(message) {
    super(message);
    this.name = "CausetAuthError";
  }
};
var CausetApiError = class extends CausetError {
  statusCode;
  body;
  constructor(statusCode, message, body = null) {
    super(`[${statusCode}] ${message}`);
    this.name = "CausetApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
};

// node_modules/@causet/sdk-core/dist/intent-id.js
function generateIntentId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// node_modules/@causet/sdk-core/dist/query-projection.js
function flattenProjectionRow(row) {
  const out = {};
  const byShort = /* @__PURE__ */ new Map();
  for (const [k, v] of Object.entries(row)) {
    if (typeof k !== "string") {
      out[k] = v;
      continue;
    }
    const short = k.includes(".") ? k.split(".").pop() : k;
    if (!byShort.has(short))
      byShort.set(short, []);
    byShort.get(short).push([k, v]);
  }
  for (const [short, pairs] of byShort) {
    out[short] = pairs[pairs.length - 1][1];
  }
  return out;
}
function flattenProjectionItems(items) {
  return items.map((r) => r && typeof r === "object" && !Array.isArray(r) ? flattenProjectionRow(r) : r);
}
function stringifyQueryInput(raw) {
  if (!raw)
    return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v == null)
      continue;
    if (typeof v === "string")
      out[k] = v;
    else if (typeof v === "boolean")
      out[k] = v ? "true" : "false";
    else if (typeof v === "number")
      out[k] = Number.isInteger(v) ? String(v) : String(v);
    else
      out[k] = JSON.stringify(v);
  }
  return out;
}

// node_modules/@causet/sdk-core/dist/fetch.js
var boundFetch = ((...args) => globalThis.fetch(...args));

// node_modules/@causet/sdk-core/dist/http-client.js
var DEFAULT_TIMEOUT_MS = 12e4;
function base(cfg) {
  return `${cfg.apiUrl.replace(/\/+$/, "")}/v1/platforms/${encodeURIComponent(cfg.platformSlug)}/applications/${encodeURIComponent(cfg.appSlug)}`;
}
function runtimeBase(cfg) {
  return `${cfg.apiUrl.replace(/\/+$/, "")}/v1/runtime/platforms/${encodeURIComponent(cfg.platformSlug)}/applications/${encodeURIComponent(cfg.appSlug)}`;
}
function headers(cfg) {
  const h = { "Content-Type": "application/json" };
  if (cfg.bearerToken)
    h.Authorization = `Bearer ${cfg.bearerToken}`;
  return h;
}
async function request(fetchImpl, method, url, hdrs, body, params, allow404 = false) {
  const u = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params))
      u.searchParams.set(k, v);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(u.toString(), {
      method,
      headers: hdrs,
      body: body != null ? JSON.stringify(body) : void 0,
      signal: ctrl.signal
    });
    if (allow404 && resp.status === 404)
      return null;
    if (resp.status < 200 || resp.status >= 300) {
      let msg = resp.statusText || "Request failed";
      let respBody = null;
      try {
        respBody = await resp.json();
        const b = respBody;
        const code = b.rejectionCode || b.rejection_code;
        const detail = b.rejectionMessage || b.rejection_message || b.message || b.error;
        if (code && detail)
          msg = `${code}: ${detail}`;
        else if (detail)
          msg = detail;
        else if (code)
          msg = code;
      } catch {
      }
      throw new CausetApiError(resp.status, msg, respBody);
    }
    const text = (await resp.text()).trim();
    if (!text)
      return {};
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}
function parseSnapshot(data) {
  let state = data;
  const raw = data.snapshotJson;
  if (raw != null) {
    if (typeof raw === "string") {
      try {
        state = JSON.parse(raw);
      } catch {
        state = data;
      }
    } else {
      state = raw;
    }
  }
  const cursor = data.snapshotVersion ?? data.watermark ?? 0;
  return { state, cursor: Number(cursor) || 0 };
}
async function fetchState(cfg, streamId, entityId, fetchImpl = boundFetch) {
  const url = `${base(cfg)}/entities/${encodeURIComponent(streamId)}/${encodeURIComponent(entityId)}/state`;
  const data = await request(fetchImpl, "GET", url, headers(cfg), void 0, { forkId: cfg.forkId ?? "main" }, true);
  if (!data)
    return { state: null, cursor: 0 };
  return parseSnapshot(data);
}
async function emitIntent(cfg, streamId, entityId, intentType, payload, intentId, fetchImpl = boundFetch) {
  const url = `${runtimeBase(cfg)}/intents/submit`;
  const body = {
    intentId: intentId?.trim() || generateIntentId(),
    forkId: cfg.forkId ?? "main",
    streamId,
    entityId,
    intentType,
    payload
  };
  const data = await request(fetchImpl, "POST", url, headers(cfg), body);
  const rejectionCode = firstString(data, "rejectionCode", "rejection_code", "code");
  const rejectionMessage = firstString(data, "rejectionMessage", "rejection_message", "message", "error");
  const accepted = Boolean(data?.accepted);
  return {
    accepted,
    executionId: data?.executionId,
    rejectionCode,
    rejectionMessage,
    error: accepted ? void 0 : formatIntentRejection(rejectionCode, rejectionMessage, intentType),
    statePatch: data?.statePatch ?? data?.state_patch_json
  };
}
function firstString(data, ...keys) {
  if (!data)
    return void 0;
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim())
      return v.trim();
  }
  return void 0;
}
function formatIntentRejection(code, message, intentType) {
  if (code && message)
    return `${code}: ${message}`;
  if (message)
    return message;
  if (code)
    return code;
  return `Intent ${intentType} was not accepted`;
}
async function runQuery(cfg, querySlug, input, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? boundFetch;
  const fork = cfg.forkId ?? "main";
  const url = `${base(cfg)}/forks/${encodeURIComponent(fork)}/queries/${encodeURIComponent(querySlug)}/run`;
  const body = { input: stringifyQueryInput(input) };
  if (opts.limit != null)
    body.limit = opts.limit;
  if (opts.cursor != null)
    body.cursor = opts.cursor;
  else if (opts.offset != null && opts.offset > 0)
    body.offset = opts.offset;
  if (opts.includeTotal)
    body.include_total = true;
  const data = await request(fetchImpl, "POST", url, headers(cfg), body);
  const result = data ?? { items: [] };
  if (Array.isArray(result.items)) {
    result.items = flattenProjectionItems(result.items);
  }
  return result;
}
async function listQueries(cfg, fetchImpl = boundFetch) {
  const fork = cfg.forkId ?? "main";
  const url = `${base(cfg)}/forks/${encodeURIComponent(fork)}/queries`;
  return await request(fetchImpl, "GET", url, headers(cfg)) ?? [];
}
async function getQueryDefinition(cfg, querySlug, fetchImpl = boundFetch) {
  const fork = cfg.forkId ?? "main";
  const url = `${base(cfg)}/forks/${encodeURIComponent(fork)}/queries/${encodeURIComponent(querySlug)}`;
  return await request(fetchImpl, "GET", url, headers(cfg)) ?? {};
}
async function listProjections(cfg, fetchImpl = boundFetch) {
  const fork = cfg.forkId ?? "main";
  const url = `${base(cfg)}/forks/${encodeURIComponent(fork)}/projections`;
  return await request(fetchImpl, "GET", url, headers(cfg)) ?? [];
}
async function listEntities(cfg, opts = {}) {
  const fetchImpl = opts.fetchImpl ?? boundFetch;
  const params = { forkId: cfg.forkId ?? "main" };
  if (opts.streamName)
    params.streamName = opts.streamName;
  if (opts.searchPrefix)
    params.searchPrefix = opts.searchPrefix;
  if (opts.cursor)
    params.cursor = opts.cursor;
  if (opts.limit != null)
    params.limit = String(opts.limit);
  const url = `${base(cfg)}/entities`;
  return await request(fetchImpl, "GET", url, headers(cfg), void 0, params) ?? {};
}

// node_modules/@causet/sdk-core/dist/patch.js
function getPath(obj, path) {
  if (!path || !path.startsWith("/"))
    return null;
  let current = obj;
  for (const key of path.slice(1).split("/")) {
    if (current == null || typeof current !== "object")
      return null;
    if (Array.isArray(current)) {
      const idx = Number(key);
      if (Number.isNaN(idx))
        return null;
      current = current[idx];
    } else {
      current = current[key];
    }
  }
  return current;
}
function setPath(obj, path, value) {
  if (!path || !path.startsWith("/"))
    return;
  const keys = path.slice(1).split("/");
  const last = keys.pop();
  let current = obj;
  for (const key of keys) {
    const child = current[key];
    if (child == null || typeof child !== "object" || Array.isArray(child)) {
      current[key] = {};
    }
    current = current[key];
  }
  current[last] = value;
}
function applyPatch(state, ops) {
  if (!Array.isArray(ops))
    return;
  for (const op of ops) {
    const type = op.op;
    const path = op.path ?? "";
    if (!path.startsWith("/"))
      continue;
    if (type === "replace" || type === "add") {
      setPath(state, path, op.value);
    } else if (type === "remove") {
      const keys = path.slice(1).split("/");
      const last = keys.pop();
      const parent = keys.length === 0 ? state : getPath(state, `/${keys.join("/")}`);
      if (parent && typeof parent === "object" && !Array.isArray(parent)) {
        delete parent[last];
      }
    }
  }
}

// node_modules/@causet/sdk-core/dist/transport-sse.js
function parseSseChunk(buffer) {
  const events = [];
  const blocks = buffer.split("\n\n");
  const remainder = blocks.pop() ?? "";
  for (const block of blocks) {
    if (!block.trim())
      continue;
    let id;
    let event;
    const dataLines = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("id:"))
        id = line.slice(3).trim();
      else if (line.startsWith("event:"))
        event = line.slice(6).trim();
      else if (line.startsWith("data:"))
        dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0)
      continue;
    const raw = dataLines.join("\n");
    let data = raw;
    try {
      data = JSON.parse(raw);
    } catch {
    }
    events.push({ id, event, data });
  }
  return { events, remainder };
}
async function submitIntentStream(cfg, body, onEvent, fetchImpl = boundFetch, signal) {
  const url = `${cfg.apiUrl.replace(/\/+$/, "")}/v1/runtime/stream/platforms/${encodeURIComponent(cfg.platformSlug)}/applications/${encodeURIComponent(cfg.appSlug)}/intents/submit`;
  const hdrs = {
    "Content-Type": "application/json",
    Accept: "text/event-stream"
  };
  if (cfg.bearerToken)
    hdrs.Authorization = `Bearer ${cfg.bearerToken}`;
  const resp = await fetchImpl(url, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify(body),
    signal
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`SSE intent submit failed: ${resp.status}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done)
      break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseChunk(buffer);
    buffer = parsed.remainder;
    for (const ev of parsed.events)
      onEvent(ev);
  }
}

// node_modules/@causet/sdk-core/dist/realtime.js
var REALTIME_HOST_BY_API = {
  "sandbox.api.causet.cloud": "sandbox.realtime.causet.cloud",
  "api.causet.cloud": "realtime.causet.cloud"
};
function deriveRealtimeUrl(apiUrl) {
  const trimmed = apiUrl.replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    const mapped = REALTIME_HOST_BY_API[url.hostname];
    if (mapped) {
      url.hostname = mapped;
      return url.origin;
    }
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      const port = url.port === "8085" || url.port === "" ? "8081" : url.port;
      return `${url.protocol}//${url.hostname}:${port}`;
    }
    if (url.hostname.includes(".api.")) {
      url.hostname = url.hostname.replace(".api.", ".realtime.");
      return url.origin;
    }
  } catch {
  }
  return trimmed;
}
function deriveWsUrlFromRealtime(realtimeUrl) {
  const u = realtimeUrl.replace(/\/+$/, "");
  if (u.startsWith("https://"))
    return u.replace("https://", "wss://") + "/ws";
  if (u.startsWith("http://"))
    return u.replace("http://", "ws://") + "/ws";
  return `${u}/ws`;
}
function buildStreamEventsUrl(realtimeUrl, cfg, opts) {
  const base2 = deriveRealtimeUrl(realtimeUrl);
  const forkId = opts.forkId ?? cfg.forkId ?? "main";
  const platform = cfg.platformId || cfg.platformSlug;
  const application = cfg.applicationId || cfg.appSlug;
  const u = new URL(`${base2}/v1/platforms/${encodeURIComponent(platform)}/applications/${encodeURIComponent(application)}/streams/${encodeURIComponent(opts.streamId)}/events`);
  u.searchParams.set("fork_id", forkId);
  if (opts.fromCursor != null) {
    u.searchParams.set("from_cursor", String(opts.fromCursor));
  }
  if (opts.token)
    u.searchParams.set("token", opts.token);
  if (opts.apiKey)
    u.searchParams.set("api_key", opts.apiKey);
  return u.toString();
}

// node_modules/@causet/sdk-core/dist/transport-stream-sse.js
var CausetTransportStreamSse = class {
  opts;
  abort = null;
  isConnected = false;
  connId = null;
  constructor(opts) {
    this.opts = opts;
  }
  async connect() {
    const fetchImpl = this.opts.fetchImpl ?? boundFetch;
    const token = this.opts.cfg.bearerToken;
    const url = buildStreamEventsUrl(this.opts.realtimeUrl, this.opts.cfg, {
      streamId: this.opts.streamId,
      forkId: this.opts.forkId,
      fromCursor: this.opts.fromCursor,
      token: token || void 0,
      apiKey: this.opts.apiKey
    });
    this.abort = new AbortController();
    const resp = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        ...token ? { Authorization: `Bearer ${token}` } : {}
      },
      signal: this.abort.signal
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`Stream SSE connect failed: ${resp.status}`);
    }
    this.isConnected = true;
    this.connId = `sse-${this.opts.streamId}`;
    this.opts.onConnected?.();
    void this.readLoop(resp.body.getReader());
    return this.connId;
  }
  async readLoop(reader) {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.remainder;
        for (const ev of parsed.events) {
          if (ev.data && typeof ev.data === "object" && !Array.isArray(ev.data)) {
            const data = { ...ev.data };
            if (ev.event && ev.event !== "message" && data.event_type == null && data.eventType == null) {
              data.event_type = ev.event;
            }
            this.opts.onEvent?.(data);
          }
        }
      }
    } catch (err) {
      if (this.abort?.signal.aborted)
        return;
      this.opts.onError?.(err);
    } finally {
      this.isConnected = false;
      this.opts.onClose?.();
    }
  }
  disconnect() {
    this.abort?.abort();
    this.abort = null;
    this.isConnected = false;
    this.connId = null;
  }
};

// node_modules/@causet/sdk-core/dist/transport-ws.js
var SDK_VERSION = "0.1.0";
var CausetTransportWebSocket = class {
  opts;
  ws = null;
  connId = null;
  isConnected = false;
  constructor(opts) {
    this.opts = opts;
  }
  connect() {
    const WS = this.opts.WebSocketImpl ?? WebSocket;
    const url = this.buildUrl();
    const protocols = [];
    this.ws = new WS(url, protocols);
    return new Promise((resolve, reject) => {
      if (!this.ws)
        return reject(new Error("WebSocket unavailable"));
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify(this.buildHello()));
      };
      this.ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(String(msg.data));
          if (data.type === "welcome") {
            this.connId = data.conn_id ?? null;
            this.isConnected = true;
            this.opts.onWelcome?.(this.connId);
            resolve(this.connId);
            return;
          }
          if (data.type === "error") {
            this.opts.onError?.(data);
            return;
          }
          this.opts.onEvent?.(data);
        } catch (e) {
          this.opts.onError?.(e);
        }
      };
      this.ws.onerror = (e) => {
        this.opts.onError?.(e);
        reject(e);
      };
      this.ws.onclose = () => {
        this.isConnected = false;
        this.opts.onClose?.();
      };
    });
  }
  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.isConnected = false;
  }
  buildUrl() {
    const u = new URL(this.opts.wsUrl);
    if (this.opts.apiKey)
      u.searchParams.set("api_key", this.opts.apiKey);
    if (this.opts.bearerToken)
      u.searchParams.set("token", this.opts.bearerToken);
    return u.toString();
  }
  buildHello() {
    const channels = (this.opts.channels ?? [{ channel: "ledger" }, { channel: "state" }]).map((ch) => {
      const entry = { ...ch };
      if (this.opts.fromCursor != null && entry.from_cursor == null) {
        entry.from_cursor = this.opts.fromCursor;
      }
      return entry;
    });
    return {
      type: "hello",
      v: 1,
      stream_id: this.opts.streamId,
      fork_id: this.opts.forkId ?? this.opts.env ?? "main",
      subs: channels,
      sdk: { name: "causet-sdk-js", ver: SDK_VERSION }
    };
  }
};

// node_modules/@causet/sdk-core/dist/token-manager.js
var REFRESH_BUFFER_MS = 3e4;
var MAX_ATTEMPTS = 4;
var RETRY_BASE_MS = 350;
var ApiKeyTokenManager = class {
  apiUrl;
  apiKey;
  fetchImpl;
  token = null;
  expiresAt = 0;
  inflight = null;
  refreshTimer = null;
  constructor(apiUrl, apiKey, fetchImpl = boundFetch) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }
  async getToken() {
    const refreshAt = this.expiresAt - REFRESH_BUFFER_MS;
    if (this.token && Date.now() < refreshAt) {
      return this.token;
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = this.exchange();
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }
  async init() {
    await this.getToken();
  }
  async forceRefresh() {
    this.destroyTimers();
    this.token = null;
    this.expiresAt = 0;
    return this.getToken();
  }
  destroy() {
    this.destroyTimers();
  }
  destroyTimers() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  async exchange() {
    let lastError;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const resp = await this.fetchImpl(`${this.apiUrl.replace(/\/+$/, "")}/v1/token`, {
          method: "POST",
          headers: { Authorization: `ApiKey ${this.apiKey}` }
        });
        if (!resp.ok) {
          let msg = `Token exchange failed: ${resp.status}`;
          try {
            const body = await resp.json();
            if (body.error)
              msg = body.error;
          } catch {
          }
          throw new CausetAuthError(msg);
        }
        const data = await resp.json();
        if (!data.token) {
          throw new CausetAuthError("Token exchange returned no token");
        }
        this.token = data.token;
        this.expiresAt = Date.now() + (data.expiresIn ?? 300) * 1e3;
        this.scheduleRefresh();
        return this.token;
      } catch (e) {
        lastError = e;
        if (e instanceof CausetAuthError)
          throw e;
        if (attempt + 1 >= MAX_ATTEMPTS)
          break;
        await sleep(RETRY_BASE_MS * 2 ** attempt);
      }
    }
    throw new CausetAuthError(`Causet auth unreachable: ${lastError instanceof Error ? lastError.message : "unknown error"}`);
  }
  scheduleRefresh() {
    this.destroyTimers();
    const delay = this.expiresAt - Date.now() - REFRESH_BUFFER_MS;
    if (delay <= 0)
      return;
    this.refreshTimer = setTimeout(() => {
      this.exchange().catch(() => void 0);
    }, delay);
  }
};
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function orgIdFromToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2)
      return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = 4 - payload.length % 4;
    if (pad !== 4)
      payload += "=".repeat(pad);
    const json = JSON.parse(atob(payload));
    return json.org_id ?? null;
  } catch {
    return null;
  }
}

// node_modules/@causet/sdk-core/dist/domain-events.js
function isInternalEventType(type) {
  const t = String(type || "");
  return !t || t === "message" || t === "event" || t === "STATE_PATCH" || t === "STATE_EMIT" || t === "__bootstrap__" || t.startsWith("REJECTED:");
}
function pushDomain(out, seen, type, entity, payload) {
  const t = String(type || "").trim();
  if (isInternalEventType(t))
    return;
  const ent = String(entity || "");
  const key = `${t}|${ent}`;
  if (seen.has(key))
    return;
  seen.add(key);
  out.push({ type: t, entity: ent, payload });
}
function extractDomainEvents(event, sseEventName) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const top = sseEventName || event.event_type || event.eventType || "";
  const entity = event.entity_id || event.entityId || "";
  const emits = Array.isArray(event.emits) ? event.emits : [];
  const patch = Array.isArray(event.patch) ? event.patch : [];
  if (!isInternalEventType(String(top))) {
    const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : event;
    pushDomain(out, seen, top, entity, payload);
  }
  for (const em of emits) {
    if (!em || typeof em !== "object")
      continue;
    const row = em;
    const et = row.event_type || row.eventType || "";
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : row;
    pushDomain(out, seen, et, row.entity_id || row.entityId || entity || payload.transfer_id || "", payload);
  }
  for (const op of patch) {
    if (!op || typeof op !== "object")
      continue;
    const row = op;
    const v = row.value;
    if (!v || typeof v !== "object" || Array.isArray(v))
      continue;
    const val = v;
    const et = val.eventType || val.event_type || "";
    if (et) {
      const payload = val.payload && typeof val.payload === "object" && !Array.isArray(val.payload) ? val.payload : val;
      pushDomain(out, seen, et, entity || payload.transfer_id || val.transfer_id || "", payload);
    }
  }
  return out;
}

// node_modules/@causet/sdk-core/dist/client.js
function subKey(streamId, entityId) {
  return `${streamId}:${entityId}`;
}
function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
var CausetClient = class {
  fetchImpl;
  tokenManager;
  subscriptions = /* @__PURE__ */ new Map();
  emitter = new Emitter();
  selectors = /* @__PURE__ */ new Set();
  /** Active live transports keyed by stream id (supports multi-stream SSE/WS). */
  streamTransports = /* @__PURE__ */ new Map();
  apiUrl;
  platformSlug;
  appSlug;
  forkId;
  wsUrl;
  realtimeUrl;
  streamTransportMode;
  bearerToken;
  apiKey;
  platformId;
  applicationId;
  constructor(options) {
    this.apiUrl = options.apiUrl;
    this.platformSlug = options.platformSlug;
    this.appSlug = options.appSlug;
    this.forkId = options.forkId ?? "main";
    this.platformId = options.platformId ?? "";
    this.applicationId = options.applicationId ?? "";
    this.realtimeUrl = options.realtimeUrl ?? deriveRealtimeUrl(options.apiUrl);
    this.wsUrl = options.wsUrl ?? deriveWsUrlFromRealtime(this.realtimeUrl);
    this.streamTransportMode = options.streamTransport ?? "websocket";
    this.bearerToken = options.bearerToken ?? "";
    this.apiKey = options.apiKey ?? "";
    this.fetchImpl = options.fetchImpl ?? boundFetch;
    this.tokenManager = this.apiKey ? new ApiKeyTokenManager(this.apiUrl, this.apiKey, this.fetchImpl) : null;
  }
  async getToken() {
    if (this.tokenManager)
      return this.tokenManager.getToken();
    return this.bearerToken || null;
  }
  async getTokenPublic() {
    const t = await this.getToken();
    if (!t)
      throw new CausetError("No Causet token \u2014 set apiKey or bearerToken");
    return t;
  }
  httpConfig(token) {
    return {
      apiUrl: this.apiUrl,
      platformSlug: this.platformSlug,
      appSlug: this.appSlug,
      forkId: this.forkId,
      bearerToken: token ?? "",
      platformId: this.platformId || void 0,
      applicationId: this.applicationId || void 0
    };
  }
  async runWithRetry(fn) {
    const token = await this.getToken();
    try {
      return await fn(this.httpConfig(token));
    } catch (e) {
      if (e instanceof CausetApiError && e.statusCode === 401 && this.tokenManager) {
        await this.tokenManager.forceRefresh();
        const token2 = await this.getToken();
        return fn(this.httpConfig(token2));
      }
      throw e;
    }
  }
  async init() {
    await this.tokenManager?.init();
  }
  destroy() {
    this.disconnectStream();
    this.tokenManager?.destroy();
  }
  on(eventType, handler) {
    return this.emitter.on(eventType, handler);
  }
  /**
   * Resolve platform/app slugs → UUIDs via CLI catalog endpoints.
   * Required for realtime SSE hub matching on local/open deployments.
   */
  async resolveIds() {
    if (this.platformId && this.applicationId) {
      return { platformId: this.platformId, applicationId: this.applicationId };
    }
    const token = await this.getToken();
    const hdrs = { "Content-Type": "application/json" };
    if (token)
      hdrs.Authorization = `Bearer ${token}`;
    const base2 = this.apiUrl.replace(/\/+$/, "");
    const [plats, apps] = await Promise.all([
      this.fetchImpl(`${base2}/v1/cli/platforms`, { headers: hdrs }).then((r) => r.json()),
      this.fetchImpl(`${base2}/v1/cli/apps`, { headers: hdrs }).then((r) => r.json())
    ]);
    const asList = (raw, keys) => {
      if (Array.isArray(raw))
        return raw;
      if (raw && typeof raw === "object") {
        for (const k of keys) {
          const v = raw[k];
          if (Array.isArray(v))
            return v;
        }
      }
      return [];
    };
    const platList = asList(plats, ["platforms", "data"]);
    const appList = asList(apps, ["apps", "data"]);
    const plat = platList.find((p) => p.slug === this.platformSlug || p.id === this.platformSlug);
    const matched = appList.filter((a) => a.slug === this.appSlug || a.id === this.appSlug);
    const app = matched.find((a) => !plat || a.platform_id === plat.id || a.platform_id === this.platformSlug) || matched[0];
    if (!plat?.id)
      throw new CausetError(`Platform not found: ${this.platformSlug}`);
    if (!app?.id)
      throw new CausetError(`Application not found: ${this.appSlug}`);
    this.platformId = String(plat.id);
    this.applicationId = String(app.id);
    return { platformId: this.platformId, applicationId: this.applicationId };
  }
  async subscribe(streamId, entityId) {
    const result = await this.runWithRetry((cfg) => fetchState(cfg, streamId, entityId, this.fetchImpl));
    const state = result.state ?? {};
    this.subscriptions.set(subKey(streamId, entityId), {
      state: deepClone(state),
      cursor: result.cursor
    });
    this.emitter.emit("state", { streamId, entityId, state: this.getState(streamId, entityId) });
    this.notifySelectors(streamId, entityId);
  }
  unsubscribe(streamId, entityId) {
    this.subscriptions.delete(subKey(streamId, entityId));
    for (const s of this.selectors) {
      if (s.streamId === streamId && s.entityId === entityId) {
        this.selectors.delete(s);
      }
    }
  }
  getState(streamId, entityId) {
    const sub = this.subscriptions.get(subKey(streamId, entityId));
    return sub ? deepClone(sub.state) : null;
  }
  async emit(streamId, entityId, intentType, payload, intentId) {
    const result = await this.runWithRetry((cfg) => emitIntent(cfg, streamId, entityId, intentType, payload, intentId, this.fetchImpl));
    if (!result.accepted) {
      throw new CausetError(result.error || `Intent ${intentType} was not accepted`);
    }
    await this.refreshSubscriptionAfterIntent(streamId, entityId, result);
    return result;
  }
  /** Submit intent and stream SSE progress events (START, COMPLETE, ERROR, …). */
  async emitStream(streamId, entityId, intentType, payload, onEvent, intentId, signal) {
    const token = await this.getTokenPublic();
    const body = {
      intentId: intentId?.trim() || generateIntentId(),
      forkId: this.forkId,
      streamId,
      entityId,
      intentType,
      payload
    };
    await submitIntentStream(this.httpConfig(token), body, onEvent, this.fetchImpl, signal);
  }
  async runQuery(querySlug, input, opts = {}) {
    return this.runWithRetry((cfg) => runQuery(cfg, querySlug, input, { ...opts, fetchImpl: this.fetchImpl }));
  }
  listQueries() {
    return this.runWithRetry((cfg) => listQueries(cfg, this.fetchImpl));
  }
  getQueryDefinition(querySlug) {
    return this.runWithRetry((cfg) => getQueryDefinition(cfg, querySlug, this.fetchImpl));
  }
  listProjections() {
    return this.runWithRetry((cfg) => listProjections(cfg, this.fetchImpl));
  }
  listEntities(opts = {}) {
    return this.runWithRetry((cfg) => listEntities(cfg, { ...opts, fetchImpl: this.fetchImpl }));
  }
  async fetchState(streamId, entityId) {
    return this.runWithRetry((cfg) => fetchState(cfg, streamId, entityId, this.fetchImpl));
  }
  /**
   * Connect a live stream (WebSocket or SSE). Replaces any prior connection for the
   * same streamId; other streams stay open (use connectStreams for several at once).
   */
  async connectStream(streamId, opts = {}) {
    this.disconnectStream(streamId);
    const token = await this.getToken();
    const mode = opts.transport ?? this.streamTransportMode;
    const onEvent = (event) => this.handleStreamEvent(streamId, event);
    if (mode === "sse") {
      const transport2 = new CausetTransportStreamSse({
        realtimeUrl: this.realtimeUrl,
        cfg: this.httpConfig(token),
        streamId,
        forkId: this.forkId,
        fromCursor: opts.fromCursor,
        apiKey: this.apiKey || void 0,
        fetchImpl: this.fetchImpl,
        onEvent,
        onConnected: () => this.emitter.emit("stream_connected", { streamId, connId: `sse-${streamId}`, transport: "sse" }),
        onError: (err) => this.emitter.emit("error", err),
        onClose: () => {
          if (this.streamTransports.get(streamId) === transport2) {
            this.streamTransports.delete(streamId);
          }
          this.emitter.emit("stream_disconnected", { streamId, transport: "sse" });
        }
      });
      this.streamTransports.set(streamId, transport2);
      return transport2.connect();
    }
    if (!token && !this.apiKey) {
      throw new CausetError("WebSocket stream requires apiKey or bearerToken");
    }
    const orgId = token && orgIdFromToken(token) || this.platformSlug;
    const transport = new CausetTransportWebSocket({
      wsUrl: this.wsUrl,
      projectId: orgId,
      forkId: this.forkId,
      streamId,
      bearerToken: token || void 0,
      apiKey: this.apiKey || void 0,
      channels: opts.channels,
      fromCursor: opts.fromCursor,
      onEvent,
      onWelcome: (connId) => this.emitter.emit("stream_connected", { streamId, connId, transport: "websocket" }),
      onError: (err) => this.emitter.emit("error", err),
      onClose: () => {
        if (this.streamTransports.get(streamId) === transport) {
          this.streamTransports.delete(streamId);
        }
        this.emitter.emit("stream_disconnected", { streamId, transport: "websocket" });
      }
    });
    this.streamTransports.set(streamId, transport);
    return transport.connect();
  }
  /** Connect several live streams with the same options (e.g. wallet + transfer). */
  async connectStreams(streamIds, opts = {}) {
    return Promise.all(streamIds.map((id) => this.connectStream(id, opts)));
  }
  /** Disconnect one stream, or all when streamId is omitted. */
  disconnectStream(streamId) {
    if (streamId) {
      const t = this.streamTransports.get(streamId);
      t?.disconnect();
      this.streamTransports.delete(streamId);
      return;
    }
    for (const t of this.streamTransports.values())
      t.disconnect();
    this.streamTransports.clear();
  }
  /** Whether any (or a specific) live stream transport is registered. */
  isStreamConnected(streamId) {
    if (streamId)
      return this.streamTransports.has(streamId);
    return this.streamTransports.size > 0;
  }
  select(streamId, entityId, selector, handler) {
    const entry = { streamId, entityId, selector, handler };
    const state = this.getState(streamId, entityId);
    if (state) {
      entry.lastValue = selector(state);
      handler(entry.lastValue);
    }
    this.selectors.add(entry);
    return () => this.selectors.delete(entry);
  }
  async refreshSubscriptionAfterIntent(streamId, entityId, result) {
    const key = subKey(streamId, entityId);
    const sub = this.subscriptions.get(key);
    if (!sub)
      return;
    if (result.statePatch) {
      const ops = typeof result.statePatch === "string" ? JSON.parse(result.statePatch) : result.statePatch;
      if (Array.isArray(ops)) {
        applyPatch(sub.state, ops);
        this.emitter.emit("patch_op", { streamId, entityId, ops });
      }
    } else {
      const fresh = await this.runWithRetry((cfg) => fetchState(cfg, streamId, entityId, this.fetchImpl));
      sub.state = deepClone(fresh.state ?? {});
      sub.cursor = fresh.cursor;
    }
    this.emitter.emit("state", { streamId, entityId, state: this.getState(streamId, entityId) });
    this.notifySelectors(streamId, entityId);
  }
  handleStreamEvent(streamId, event) {
    this.emitter.emit("stream_event", { streamId, event });
    for (const d of extractDomainEvents(event)) {
      this.emitter.emit("domain_event", { streamId, ...d });
    }
    const patch = event.patch;
    const entityId = event.entity_id;
    if (Array.isArray(patch) && entityId) {
      const sub = this.subscriptions.get(subKey(streamId, entityId));
      if (sub) {
        applyPatch(sub.state, patch);
        this.emitter.emit("patch_op", { streamId, entityId, ops: patch });
        this.emitter.emit("state", { streamId, entityId, state: this.getState(streamId, entityId) });
        this.notifySelectors(streamId, entityId);
      }
    }
    const emits = event.emits;
    if (Array.isArray(emits)) {
      this.emitter.emit("emitted", { streamId, entityId, emits });
    }
  }
  notifySelectors(streamId, entityId) {
    const state = this.getState(streamId, entityId);
    if (!state)
      return;
    for (const entry of this.selectors) {
      if (entry.streamId !== streamId || entry.entityId !== entityId)
        continue;
      const next = entry.selector(state);
      if (JSON.stringify(next) !== JSON.stringify(entry.lastValue)) {
        entry.lastValue = deepClone(next);
        entry.handler(entry.lastValue);
      }
    }
  }
};

// shared/demo-client.js
function createDemoClient(config) {
  const fetchImpl = buildFetchImpl(config);
  const client = new CausetClient({
    apiUrl: resolveApiRoot(config),
    platformSlug: config.platform,
    appSlug: config.application,
    forkId: config.forkId || "main",
    apiKey: config.useProxy ? void 0 : config.apiKey || void 0,
    bearerToken: config.useProxy ? void 0 : config.bearerToken || void 0,
    fetchImpl
  });
  const api = new DemoApi(client, config, fetchImpl);
  return { client, api };
}
function resolveApiRoot(config) {
  if (config.useProxy && typeof window !== "undefined") {
    return window.location.origin;
  }
  return (config.apiBase || "http://localhost:8085").replace(/\/+$/, "");
}
function buildFetchImpl(config) {
  if (!config.useProxy) {
    return fetch.bind(globalThis);
  }
  return async (url, options = {}) => {
    let u = String(url);
    try {
      const parsed = new URL(u, window.location.origin);
      if (parsed.pathname.startsWith("/v1/")) {
        parsed.pathname = `/api${parsed.pathname}`;
      }
      u = parsed.toString();
    } catch {
      if (u.startsWith("/v1/")) u = `/api${u}`;
    }
    return fetch(u, {
      ...options,
      credentials: "include"
    });
  };
}
var DemoApi = class {
  /** @param {CausetClient} client @param {DemoConfig} config @param {typeof fetch} fetchImpl */
  constructor(client, config, fetchImpl) {
    this.client = client;
    this.config = config;
    this.fetchImpl = fetchImpl;
  }
  async init() {
    if (!this.config.useProxy && (this.config.apiKey || this.config.bearerToken)) {
      await this.client.init();
    }
  }
  platformPath(suffix) {
    const p = encodeURIComponent(this.config.platform);
    const a = encodeURIComponent(this.config.application);
    const root = resolveApiRoot(this.config);
    const prefix = this.config.useProxy ? "/api/v1" : "/v1";
    return `${root}${prefix}/platforms/${p}/applications/${a}${suffix}`;
  }
  async request(url, options = {}) {
    const headers2 = { "Content-Type": "application/json", ...options.headers || {} };
    if (!this.config.useProxy && (this.config.apiKey || this.config.bearerToken)) {
      const token = await this.client.getTokenPublic();
      headers2.Authorization = `Bearer ${token}`;
    }
    const res = await this.fetchImpl(url, {
      ...options,
      headers: headers2,
      credentials: this.config.useProxy ? "include" : "omit"
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text };
    }
    if (!res.ok) {
      const err = new Error(data.error || data.message || text || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  /** Submit intent via SDK (runtime submit path). */
  async emitIntent(streamId, entityId, intentType, payload, intentId) {
    return this.client.emit(streamId, entityId, intentType, payload, intentId);
  }
  /** Run named query via SDK. */
  async runQuery(querySlug, input = {}, opts = {}) {
    return this.client.runQuery(querySlug, input, {
      limit: opts.limit,
      cursor: opts.cursor,
      includeTotal: opts.includeTotal ?? opts.include_total ?? true
    });
  }
  /** Fetch entity snapshot via SDK. */
  async fetchEntityState(streamId, entityId) {
    const result = await this.client.fetchState(streamId, entityId);
    return {
      snapshotJson: result.state,
      snapshotVersion: result.cursor,
      ...typeof result.state === "object" && result.state ? result.state : {}
    };
  }
  async listIntents(streamName) {
    const q = new URLSearchParams({ forkId: this.config.forkId, streamName });
    const path = this.config.useProxy ? `/intents?${q}` : `/intents/list?${q}`;
    return this.request(this.platformPath(path));
  }
  async fetchEntityDecisions(streamId, entityId) {
    const q = `forkId=${encodeURIComponent(this.config.forkId)}`;
    return this.request(
      this.platformPath(`/entities/${streamId}/${encodeURIComponent(entityId)}/decisions?${q}`)
    );
  }
  async fetchEntityTimeline(streamId, entityId, limit = 100) {
    const q = new URLSearchParams({
      forkId: this.config.forkId,
      limit: String(limit)
    });
    return this.request(
      this.platformPath(`/entities/${streamId}/${encodeURIComponent(entityId)}/timeline?${q}`)
    );
  }
  async fetchLedgerEvents(streamId, entityId) {
    if (!this.config.useProxy) return null;
    const q = new URLSearchParams({
      streamId,
      entityId,
      forkId: this.config.forkId,
      limit: "100"
    });
    return this.request(
      `${window.location.origin}/api/v1/platforms/${encodeURIComponent(this.config.platform)}/applications/${encodeURIComponent(this.config.application)}/decision-log/ledger-events?${q}`
    );
  }
  /**
   * Metadata-only: whether provider.openai.api_key exists for the configured fork.
   * Never returns secret material — response is { configured: boolean, ... }.
   */
  async checkOpenAiSecretConfigured(forkId = this.config.forkId || "sandbox") {
    const root = resolveApiRoot(this.config);
    const prefix = this.config.useProxy ? "/api/v1" : "/v1";
    const platform = encodeURIComponent(this.config.platform);
    const fork = encodeURIComponent(forkId || "sandbox");
    const url = `${root}${prefix}/platforms/${platform}/settings/forks/${fork}/secrets/openai/configured`;
    const data = await this.request(url);
    return { configured: !!data?.configured, forkId: data?.forkId || forkId, secretName: data?.secretName };
  }
};
export {
  CausetClient,
  createDemoClient
};
//# sourceMappingURL=causet-demo-client.mjs.map
