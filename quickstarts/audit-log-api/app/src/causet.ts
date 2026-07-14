/**
 * Minimal Causet HTTP helpers shared by the audit-log API server.
 */

export type CausetConfig = {
  apiUrl: string;
  platform: string;
  application: string;
  fork: string;
  apiKey?: string;
};

export function loadConfig(): CausetConfig {
  return {
    apiUrl: (process.env.CAUSET_API_URL ?? "http://localhost:8085").replace(/\/+$/, ""),
    platform: process.env.CAUSET_PLATFORM ?? "test-platform",
    application: process.env.CAUSET_APPLICATION ?? "{{packageName}}",
    fork: process.env.CAUSET_FORK ?? "{{causetFork}}",
    apiKey: process.env.CAUSET_API_KEY || undefined,
  };
}

function headers(cfg: CausetConfig): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) h.Authorization = `Bearer ${cfg.apiKey}`;
  return h;
}

export async function executeIntent(
  cfg: CausetConfig,
  opts: {
    streamId: string;
    entityId: string;
    intentType: string;
    payload: Record<string, unknown>;
  },
): Promise<Record<string, unknown>> {
  const url = `${cfg.apiUrl}/v1/platforms/${encodeURIComponent(cfg.platform)}/applications/${encodeURIComponent(cfg.application)}/intents/execute`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({
      streamId: opts.streamId,
      entityId: opts.entityId,
      intentType: opts.intentType,
      payload: opts.payload,
      forkId: cfg.fork,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(`intent ${opts.intentType} failed (${res.status})`) as Error & {
      status: number;
      body: unknown;
    };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export async function runQuery(
  cfg: CausetConfig,
  queryName: string,
  input: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  const url = `${cfg.apiUrl}/v1/platforms/${encodeURIComponent(cfg.platform)}/applications/${encodeURIComponent(cfg.application)}/forks/${encodeURIComponent(cfg.fork)}/queries/${encodeURIComponent(queryName)}/run`;
  const res = await fetch(url, {
    method: "POST",
    headers: headers(cfg),
    body: JSON.stringify({ input }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = new Error(`query ${queryName} failed (${res.status})`) as Error & {
      status: number;
      body: unknown;
    };
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}
