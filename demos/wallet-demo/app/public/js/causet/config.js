/**
 * Causet connection config — read from the Connection form (or /config.json defaults).
 */

export function readConfig() {
  const $ = (id) => document.getElementById(id);
  return {
    apiBase: ($("apiBase")?.value || "http://localhost:8085").replace(/\/+$/, ""),
    realtimeBase: ($("realtimeBase")?.value || "http://localhost:8081").replace(/\/+$/, ""),
    platform: ($("platform")?.value || "local-platform").trim(),
    application: ($("application")?.value || "my-wallets").trim(),
    fork: ($("fork")?.value || "sandbox").trim(),
    apiKey: ($("apiKey")?.value || "").trim(),
  };
}

/** Apply server-injected defaults from GET /config.json (optional). */
export async function hydrateConfigFromServer() {
  try {
    const res = await fetch("/config.json");
    if (!res.ok) return;
    const cfg = await res.json();
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el && v != null && String(v).trim() !== "") el.value = String(v);
    };
    set("apiBase", cfg.apiUrl || cfg.apiBase);
    set("realtimeBase", cfg.realtimeUrl || cfg.realtimeBase);
    set("platform", cfg.platform);
    set("application", cfg.application);
    set("fork", cfg.fork);
    if (cfg.apiKey) set("apiKey", cfg.apiKey);
  } catch {
    /* file:// or no server — keep HTML defaults */
  }
}
