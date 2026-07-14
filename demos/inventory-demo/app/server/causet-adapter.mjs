/**
 * Causet adapter for the inventory demo — uses @causet/sdk-node.
 */

import { createCausetClient } from "@causet/sdk-node";

const LOCAL_DEFAULTS = {
  apiUrl: "http://localhost:8085",
  platform: "local-platform",
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

let sdkClient = null;

function getSdkClient() {
  if (!sdkClient) {
    sdkClient = createCausetClient({
      apiUrl: causetConfig.apiUrl,
      platformSlug: causetConfig.platform,
      appSlug: causetConfig.application,
      forkId: causetConfig.forkId,
      ...(causetConfig.apiKey ? { apiKey: causetConfig.apiKey } : {}),
    });
  }
  return sdkClient;
}

export async function runInventoryQuery(querySlug, input = null, opts = {}) {
  const result = await getSdkClient().runQuery(querySlug, input && typeof input === "object" ? input : {}, {
    limit: opts.limit,
    includeTotal: opts.includeTotal,
  });
  return { items: result.items, raw: result };
}

export async function submitInventoryIntent(intentType, entityId, payload) {
  const result = await getSdkClient().emit(STREAM_ID, entityId, intentType, payload);
  if (!result.accepted) {
    throw new Error(result.rejectionCode || result.error || `Intent ${intentType} rejected`);
  }
  return { ...result, accepted: true, intentType, entityId, payload };
}

/** Kept for status panel compatibility (no live WS client in this template). */
export async function getClient() {
  const client = getSdkClient();
  return {
    async emit(streamId, entityId, intentType, payload) {
      return submitInventoryIntent(intentType, entityId, payload);
    },
    client,
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
