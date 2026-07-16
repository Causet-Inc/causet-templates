/**
 * Thin Causet facade for the wallets demo — wraps `@causet/sdk`.
 *
 * Intents:  client.submitIntent(stream, entity, type, payload)  → runtime /intents/submit
 * Queries:  client.runQuery(slug, input)
 * Live:     client.connectStreams([...], { transport: 'sse', fromCursor: -1 })
 */

import { CausetClient as SdkClient } from '/vendor/causet-sdk.js';
import { readConfig } from './config.js';

const STREAMS = ['wallet_stream', 'transfer_stream'];

export class CausetDemoClient {
  constructor() {
    /** @type {import('@causet/sdk').CausetClient | null} */
    this.sdk = null;
  }

  /** Build / rebuild the SDK client from the Connection form. */
  createSdk() {
    const c = readConfig();
    this.sdk?.destroy();
    this.sdk = new SdkClient({
      apiUrl: c.apiBase,
      platformSlug: c.platform,
      appSlug: c.application,
      forkId: c.fork,
      realtimeUrl: c.realtimeBase,
      ...(c.apiKey
        ? (c.apiKey.startsWith('ck_') ? { apiKey: c.apiKey } : { bearerToken: c.apiKey })
        : {}),
      streamTransport: 'sse',
    });
    return this.sdk;
  }

  get client() {
    if (!this.sdk) this.createSdk();
    return this.sdk;
  }

  async executeIntent(streamId, entityId, intentType, payload) {
    return this.client.submitIntent(streamId, entityId, intentType, payload);
  }

  async runQuery(name, input = {}) {
    return this.client.runQuery(name, input);
  }

  async resolveIds() {
    return this.client.resolveIds();
  }

  /**
   * Subscribe to wallet + transfer streams (SSE, live-only).
   * @param {{
   *   onDomainEvent?: (e: { type: string, entity: string, payload: Record<string, unknown> }) => void,
   *   onPatch?: () => void,
   *   onStatus?: (state: string, label: string) => void,
   *   onLog?: (type: string, msg: string, isErr?: boolean) => void,
   * }} hooks
   */
  async connectLive(hooks = {}) {
    const sdk = this.client;
    sdk.disconnectStream();

    const offDomain = sdk.on('domain_event', (raw) => {
      const d = raw;
      hooks.onLog?.('event', `${d.type}${d.entity ? ' · ' + d.entity : ''}`);
      hooks.onDomainEvent?.({ type: d.type, entity: d.entity, payload: d.payload || {} });
    });
    const offStream = sdk.on('stream_event', () => hooks.onPatch?.());
    const offConn = sdk.on('stream_connected', (d) => {
      hooks.onLog?.('sse', `subscribed ${d.streamId}`);
      hooks.onStatus?.('live', 'SSE live');
    });
    const offErr = sdk.on('error', (err) => {
      hooks.onStatus?.('err', 'SSE error');
      hooks.onLog?.('error', err?.message || String(err), true);
    });

    this._unsubs = [offDomain, offStream, offConn, offErr];

    await sdk.resolveIds();
    await sdk.connectStreams(STREAMS, { transport: 'sse', fromCursor: -1 });
    return sdk.isStreamConnected();
  }

  stopLive() {
    this._unsubs?.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
    this._unsubs = [];
    this.sdk?.disconnectStream();
  }

  destroy() {
    this.stopLive();
    this.sdk?.destroy();
    this.sdk = null;
  }
}
