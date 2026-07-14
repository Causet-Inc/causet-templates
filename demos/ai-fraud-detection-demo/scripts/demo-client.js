/**
 * Browser helper for Causet demo HTML — wraps @causet/sdk with proxy auth
 * and demo-specific entity endpoints (timeline, decisions, intent catalog).
 */
import { CausetClient } from '@causet/sdk';

/**
 * @typedef {Object} DemoConfig
 * @property {'live'|'mock'} mode
 * @property {boolean} useProxy
 * @property {string} apiBase
 * @property {string} platform
 * @property {string} application
 * @property {string} forkId
 * @property {string} [apiKey]
 * @property {string} [bearerToken]
 */

/**
 * @param {DemoConfig} config
 * @returns {{ client: CausetClient, api: DemoApi }}
 */
export function createDemoClient(config) {
  const fetchImpl = buildFetchImpl(config);
  const client = new CausetClient({
    apiUrl: resolveApiRoot(config),
    platformSlug: config.platform,
    appSlug: config.application,
    forkId: config.forkId || 'main',
    apiKey: config.useProxy ? undefined : config.apiKey || undefined,
    bearerToken: config.useProxy ? undefined : config.bearerToken || undefined,
    fetchImpl,
  });

  const api = new DemoApi(client, config, fetchImpl);
  return { client, api };
}

function resolveApiRoot(config) {
  if (config.useProxy && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return (config.apiBase || 'http://localhost:8085').replace(/\/+$/, '');
}

/**
 * Rewrites SDK URLs for Causet Cloud control-plane proxy (/api/v1/...).
 */
function buildFetchImpl(config) {
  if (!config.useProxy) {
    return fetch.bind(globalThis);
  }

  return async (url, options = {}) => {
    let u = String(url);
    try {
      const parsed = new URL(u, window.location.origin);
      if (parsed.pathname.startsWith('/v1/')) {
        parsed.pathname = `/api${parsed.pathname}`;
      }
      u = parsed.toString();
    } catch {
      if (u.startsWith('/v1/')) u = `/api${u}`;
    }

    return fetch(u, {
      ...options,
      credentials: 'include',
    });
  };
}

class DemoApi {
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
    const prefix = this.config.useProxy ? '/api/v1' : '/v1';
    return `${root}${prefix}/platforms/${p}/applications/${a}${suffix}`;
  }

  async request(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    // Local SaaS (SECURITY_LOCAL_OPEN) accepts unauthenticated requests — skip token exchange.
    if (!this.config.useProxy && (this.config.apiKey || this.config.bearerToken)) {
      const token = await this.client.getTokenPublic();
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await this.fetchImpl(url, {
      ...options,
      headers,
      credentials: this.config.useProxy ? 'include' : 'omit',
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
      includeTotal: opts.includeTotal ?? opts.include_total ?? true,
    });
  }

  /** Fetch entity snapshot via SDK. */
  async fetchEntityState(streamId, entityId) {
    const result = await this.client.fetchState(streamId, entityId);
    return {
      snapshotJson: result.state,
      snapshotVersion: result.cursor,
      ...(typeof result.state === 'object' && result.state ? result.state : {}),
    };
  }

  async listIntents(streamName) {
    const q = new URLSearchParams({ forkId: this.config.forkId, streamName });
    const path = this.config.useProxy
      ? `/intents?${q}`
      : `/intents/list?${q}`;
    return this.request(this.platformPath(path));
  }

  async fetchEntityDecisions(streamId, entityId) {
    const q = `forkId=${encodeURIComponent(this.config.forkId)}`;
    return this.request(
      this.platformPath(`/entities/${streamId}/${encodeURIComponent(entityId)}/decisions?${q}`),
    );
  }

  async fetchEntityTimeline(streamId, entityId, limit = 100) {
    const q = new URLSearchParams({
      forkId: this.config.forkId,
      limit: String(limit),
    });
    return this.request(
      this.platformPath(`/entities/${streamId}/${encodeURIComponent(entityId)}/timeline?${q}`),
    );
  }

  async fetchLedgerEvents(streamId, entityId) {
    if (!this.config.useProxy) return null;
    const q = new URLSearchParams({
      streamId,
      entityId,
      forkId: this.config.forkId,
      limit: '100',
    });
    return this.request(
      `${window.location.origin}/api/v1/platforms/${encodeURIComponent(this.config.platform)}/applications/${encodeURIComponent(this.config.application)}/decision-log/ledger-events?${q}`,
    );
  }

  /**
   * Metadata-only: whether provider.openai.api_key exists for the configured fork.
   * Never returns secret material — response is { configured: boolean, ... }.
   */
  async checkOpenAiSecretConfigured(forkId = this.config.forkId || 'sandbox') {
    const root = resolveApiRoot(this.config);
    const prefix = this.config.useProxy ? '/api/v1' : '/v1';
    const platform = encodeURIComponent(this.config.platform);
    const fork = encodeURIComponent(forkId || 'sandbox');
    const url = `${root}${prefix}/platforms/${platform}/settings/forks/${fork}/secrets/openai/configured`;
    const data = await this.request(url);
    return { configured: !!data?.configured, forkId: data?.forkId || forkId, secretName: data?.secretName };
  }
}

export { CausetClient };
