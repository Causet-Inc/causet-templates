# {{templateName}}

Record actions as Causet intents and read them back as a queryable timeline — then wrap that in a small HTTP API.

Project: **{{projectName}}** · Fork: `{{causetFork}}` · Env: `{{causetEnvironment}}`

## What you will learn

```
POST /v1/audit  (your API)
      │
      ▼ RECORD_ACTION intent
  audit_entry entity + AUDIT_RECORDED event
      │
      ▼ projection worker
  audit_timeline table
      │
      ▼ named queries
GET /v1/audit/:id
GET /v1/audit?actor=…
GET /v1/audit?resource=…
```

This is the second quickstart after **hello-causet**. Same Causet loop — applied to an append-only audit trail that apps usually bolt on late.

| Concept | File |
|---------|------|
| Manifest | `causet/app.causet` |
| Entity | `causet/states/audit.state.causet` |
| Event | `causet/events/audit.events.causet` |
| Intent | `causet/actions/audit.actions.causet` |
| Projection | `causet/projections/audit.projections.causet` |
| Queries | `causet/queries/audit.queries.causet` |
| HTTP API | `app/src/server.ts` |

## Prerequisites

- Causet CLI + local stack **or** hosted sandbox
- Node.js 20+
- Completed (or skimmed) **hello-causet**

## Setup

```bash
cd {{projectName}}
npm install --prefix app
cp .env.example .env

causet context use env local   # or causet login for hosted
causet build compile --runtime causet --out dist
causet deploy --fork {{causetFork}} --yes
```

## Walkthrough (browser)

```bash
open demo.html
# or: python3 -m http.server 3457   → http://localhost:3457/demo.html
```

Record actions in the form, then filter the timeline by actor or resource. Same Causet calls as the Node HTTP API — no SQL.

## Walkthrough (CLI)

```bash
# Record three actions
causet intent RECORD_ACTION \
  --stream audit_entry_stream \
  --entity entry-1 \
  --payload '{"entry_id":"entry-1","actor":"alice","action":"login","resource":"auth","note":"ok"}' \
  --fork {{causetFork}}

causet intent RECORD_ACTION \
  --stream audit_entry_stream \
  --entity entry-2 \
  --payload '{"entry_id":"entry-2","actor":"alice","action":"update","resource":"doc/42","note":"title change"}' \
  --fork {{causetFork}}

causet intent RECORD_ACTION \
  --stream audit_entry_stream \
  --entity entry-3 \
  --payload '{"entry_id":"entry-3","actor":"bob","action":"delete","resource":"doc/42"}' \
  --fork {{causetFork}}

# Query the timeline (wait ~1s for projections)
causet query list_actor_timeline --param actor=alice --fork {{causetFork}}
causet query list_resource_timeline --param resource=doc/42 --fork {{causetFork}}
causet query list_recent --fork {{causetFork}}
causet query get_audit_entry --param entry_id=entry-1 --fork {{causetFork}}
```

## Walkthrough (HTTP API)

```bash
npm run dev --prefix app
# → http://localhost:3456
```

```bash
# Record
curl -s -X POST http://localhost:3456/v1/audit \
  -H 'content-type: application/json' \
  -d '{"actor":"alice","action":"login","resource":"auth","note":"ok"}' | jq

# List by actor
curl -s 'http://localhost:3456/v1/audit?actor=alice' | jq

# List by resource
curl -s 'http://localhost:3456/v1/audit?resource=doc/42' | jq

# Fetch one (use entry_id from POST response)
curl -s http://localhost:3456/v1/audit/entry-… | jq

# Recent
curl -s http://localhost:3456/v1/audit | jq
```

Your API never writes SQL. It only submits `RECORD_ACTION` and runs named queries — Causet owns durability, history, and the read model.

## API surface

| Method | Path | Causet |
|--------|------|--------|
| `POST` | `/v1/audit` | `RECORD_ACTION` |
| `GET` | `/v1/audit/:entryId` | `get_audit_entry` |
| `GET` | `/v1/audit?actor=` | `list_actor_timeline` |
| `GET` | `/v1/audit?resource=` | `list_resource_timeline` |
| `GET` | `/v1/audit` | `list_recent` |
| `GET` | `/health` | — |

## Configuration

| Variable | Default |
|----------|---------|
| `PORT` | `3456` |
| `CAUSET_API_URL` | `http://localhost:8085` |
| `CAUSET_PLATFORM` | `test-platform` |
| `CAUSET_APPLICATION` | `{{packageName}}` |
| `CAUSET_FORK` | `{{causetFork}}` |

## Next steps

- Add a `list_action_timeline` query filtered by `action`.
- Emit a second event (e.g. `AUDIT_FLAGGED`) from a preflight/core rule when `action == "delete"`.
- Scaffold a demo next: `causet new inventory my-warehouse`.
