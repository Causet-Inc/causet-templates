import { submitInventoryIntent, STREAM_ID } from "./causet-adapter.mjs";

/** @type {Set<import("http").ServerResponse>} */
const sseClients = new Set();

export function broadcastCausetEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify({ type, ...data, at: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

export function attachSseClient(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");
  sseClients.add(res);
  broadcastCausetEvent("bridge_ready", {
    streamId: STREAM_ID,
    note: "Polling/intent fan-out mode (no SDK websocket required)",
  });
  req.on("close", () => {
    sseClients.delete(res);
  });
}

export function sseClientCount() {
  return sseClients.size;
}

export async function ensureStreamBridge() {
  // No-op: this template fans out intent progress over SSE without a WS bridge.
}

/**
 * Submit intent and fan progress events out to browser SSE clients.
 */
export async function submitIntentWithStream(intentType, entityId, payload) {
  broadcastCausetEvent("intent_start", { intentType, entityId, payload });
  try {
    const result = await submitInventoryIntent(intentType, entityId, payload);
    broadcastCausetEvent("intent_progress", {
      intentType,
      entityId,
      sseEvent: "COMPLETE",
      data: result,
    });
    broadcastCausetEvent("intent_complete", result);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcastCausetEvent("intent_progress", {
      intentType,
      entityId,
      sseEvent: "ERROR",
      data: { message },
    });
    throw err;
  }
}
