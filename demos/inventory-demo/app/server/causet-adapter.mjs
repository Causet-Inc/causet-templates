/**
 * Causet HTTP adapter for the inventory demo (no SDK package required).
 * Uses the same execute + query endpoints as the Causet CLI.
 */

const LOCAL_DEFAULTS = {
  apiUrl: "http://localhost:8085",
  platform: "test-platform",
  application: "{{packageName}}",
  forkId: "{{causetFork}}",
};

export const causetConfig = {
  apiUrl: (process.env.CAUSET_API_URL || LOCAL_DEFAULTS.apiUrl).replace(/\/+$/, ""),
  platform: process.env.CAUSET_PLATFORM || LOCAL_DEFAULTS.platform,
  application: process.env.CAUSET_APPLICATION || LOCAL_DEFAULTS.application,
  forkId: process.env.CAUSET_FORK || LOCAL_DEFAULTS.forkId,
  apiKey: process.env.CAUSET_API_KEY || "",
};

export const STREAM_ID = "inventory_position_stream";

function headers() {
  const h = { "Content-Type": "application/json" };
  if (causetConfig.apiKey) h.Authorization = `Bearer ${causetConfig.apiKey}`;
  return h;
}

function flattenRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const [k, v] of Object.entries(row)) {
    const i = k.lastIndexOf(".");
    if (i >= 0) out[k.slice(i + 1)] = v;
  }
  return out;
}

function normalizeQueryResult(json) {
  const raw = Array.isArray(json?.rows)
    ? json.rows
    : Array.isArray(json?.items)
      ? json.items
      : Array.isArray(json?.data)
        ? json.data
        : [];
  return { items: raw.map(flattenRow), raw: json };
}

export async function runInventoryQuery(querySlug, input = null, opts = {}) {
  const url = `${causetConfig.apiUrl}/v1/platforms/${encodeURIComponent(causetConfig.platform)}/applications/${encodeURIComponent(causetConfig.application)}/forks/${encodeURIComponent(causetConfig.forkId)}/queries/${encodeURIComponent(querySlug)}/run`;
  const body = { input: input && typeof input === "object" ? input : {} };
  if (opts.limit) body.limit = opts.limit;
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || `Query ${querySlug} failed (${res.status})`);
  }
  return normalizeQueryResult(json);
}

export async function submitInventoryIntent(intentType, entityId, payload) {
  const url = `${causetConfig.apiUrl}/v1/platforms/${encodeURIComponent(causetConfig.platform)}/applications/${encodeURIComponent(causetConfig.application)}/intents/execute`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      streamId: STREAM_ID,
      entityId,
      intentType,
      payload,
      forkId: causetConfig.forkId,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || json.error || `Intent ${intentType} failed (${res.status})`);
  }
  if (json.accepted === false) {
    throw new Error(json.rejectionCode || json.message || `Intent ${intentType} rejected`);
  }
  return { ...json, accepted: true, intentType, entityId, payload };
}

/** Kept for status panel compatibility (no live WS client in this template). */
export async function getClient() {
  return {
    async emit(streamId, entityId, intentType, payload) {
      return submitInventoryIntent(intentType, entityId, payload);
    },
  };
}

export function getCausetStatus() {
  return {
    mode: "live",
    environment: /localhost|127\.0\.0\.1/.test(causetConfig.apiUrl) ? "local" : "custom",
    apiUrl: causetConfig.apiUrl,
    platform: causetConfig.platform,
    application: causetConfig.application,
    forkId: causetConfig.forkId,
    streamId: STREAM_ID,
    hasApiKey: Boolean(causetConfig.apiKey),
  };
}
