# {{templateName}}

Record actions as Causet intents and read them back as a queryable timeline.

Project: **{{projectName}}** · Fork: `{{causetFork}}` · Env: `{{causetEnvironment}}`

## What you will learn

```
RECORD_ACTION intent
      │
      ▼
  audit_entry entity + AUDIT_RECORDED event
      │
      ▼ projection worker
  audit_timeline table
      │
      ▼ named queries
  get_audit_entry · list_actor_timeline · list_resource_timeline · list_recent
```

This is the second quickstart after **hello-causet**. Same Causet loop — applied to an append-only audit trail.

| Concept | File |
|---------|------|
| Manifest | `causet/app.causet` |
| Entity | `causet/states/audit.state.causet` |
| Event | `causet/events/audit.events.causet` |
| Intent | `causet/actions/audit.actions.causet` |
| Projection | `causet/projections/audit.projections.causet` |
| Queries | `causet/queries/audit.queries.causet` |

## Prerequisites

- Causet CLI + local stack **or** hosted sandbox
- Completed (or skimmed) **hello-causet**

## Setup

```bash
cd {{projectName}}

causet context use env local   # or causet login for hosted
causet build compile --runtime causet --out dist
causet deploy --fork {{causetFork}} --yes
```

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

## Next steps

- Add a `list_action_timeline` query filtered by `action`.
- Emit a second event (e.g. `AUDIT_FLAGGED`) from a preflight/core rule when `action == "delete"`.
- Scaffold a demo next: `causet new inventory my-warehouse`.
