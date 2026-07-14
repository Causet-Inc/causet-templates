/**
 * Audit Log API — thin HTTP facade over Causet intents + named queries.
 *
 *   POST /v1/audit              → RECORD_ACTION
 *   GET  /v1/audit/:entryId     → get_audit_entry
 *   GET  /v1/audit?actor=…      → list_actor_timeline
 *   GET  /v1/audit?resource=…   → list_resource_timeline
 *   GET  /v1/audit              → list_recent
 *   GET  /health
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { executeIntent, loadConfig, runQuery } from "./causet.js";

const cfg = loadConfig();
const port = Number(process.env.PORT ?? 3456);
const STREAM = "audit_entry_stream";

type Json = Record<string, unknown>;

function send(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Json;
}

function pathParts(url: string): { pathname: string; search: URLSearchParams } {
  const u = new URL(url, `http://localhost:${port}`);
  return { pathname: u.pathname.replace(/\/+$/, "") || "/", search: u.searchParams };
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "content-type,authorization",
    });
    res.end();
    return;
  }

  const { pathname, search } = pathParts(req.url ?? "/");

  try {
    if (req.method === "GET" && pathname === "/health") {
      send(res, 200, {
        ok: true,
        template: "{{templateId}}",
        project: "{{projectName}}",
        causet: {
          apiUrl: cfg.apiUrl,
          platform: cfg.platform,
          application: cfg.application,
          fork: cfg.fork,
        },
      });
      return;
    }

    if (req.method === "POST" && pathname === "/v1/audit") {
      const body = await readJson(req);
      const entryId = String(body.entry_id ?? body.entryId ?? `entry-${randomUUID()}`);
      const actor = String(body.actor ?? "");
      const action = String(body.action ?? "");
      const resource = String(body.resource ?? "");
      const note = body.note != null ? String(body.note) : undefined;

      if (!actor || !action || !resource) {
        send(res, 400, {
          error: "actor, action, and resource are required",
        });
        return;
      }

      const payload: Record<string, unknown> = {
        entry_id: entryId,
        actor,
        action,
        resource,
      };
      if (note !== undefined) payload.note = note;

      const result = await executeIntent(cfg, {
        streamId: STREAM,
        entityId: entryId,
        intentType: "RECORD_ACTION",
        payload,
      });

      send(res, 201, { entry_id: entryId, intent: result });
      return;
    }

    const entryMatch = pathname.match(/^\/v1\/audit\/([^/]+)$/);
    if (req.method === "GET" && entryMatch) {
      const entryId = decodeURIComponent(entryMatch[1]);
      const result = await runQuery(cfg, "get_audit_entry", { entry_id: entryId });
      send(res, 200, result);
      return;
    }

    if (req.method === "GET" && pathname === "/v1/audit") {
      const actor = search.get("actor");
      const resource = search.get("resource");
      if (actor) {
        send(res, 200, await runQuery(cfg, "list_actor_timeline", { actor }));
        return;
      }
      if (resource) {
        send(res, 200, await runQuery(cfg, "list_resource_timeline", { resource }));
        return;
      }
      send(res, 200, await runQuery(cfg, "list_recent"));
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    const e = err as Error & { status?: number; body?: unknown };
    send(res, e.status && e.status >= 400 ? e.status : 502, {
      error: e.message,
      detail: e.body ?? undefined,
    });
  }
}

createServer((req, res) => {
  void handle(req, res);
}).listen(port, () => {
  console.log(`{{templateName}} — {{projectName}}`);
  console.log(`listening on http://localhost:${port}`);
  console.log(`Causet ${cfg.platform}/${cfg.application} fork=${cfg.fork} @ ${cfg.apiUrl}`);
  console.log();
  console.log("  POST /v1/audit");
  console.log("  GET  /v1/audit/:entryId");
  console.log("  GET  /v1/audit?actor=alice");
  console.log("  GET  /v1/audit?resource=doc/42");
  console.log("  GET  /v1/audit");
  console.log("  GET  /health");
});
