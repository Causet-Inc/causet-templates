# {{templateName}}

Your first Causet app — learn the write → event → projection → query loop.

Project: **{{projectName}}** · Fork: `{{causetFork}}` · Env: `{{causetEnvironment}}`

## What you will learn

```
CREATE_GREETING / UPDATE_GREETING   (actions — intents)
        │
        ▼
  greeting entity state             (ledger / source of truth)
        │
        ▼ emit
  GREETING_CREATED / UPDATED        (domain events)
        │
        ▼ async
  greetings projection table        (read model)
        │
        ▼
  get_greeting / list_greetings     (named queries)
```

| Concept | File |
|---------|------|
| Manifest | `causet/app.causet` |
| Entity schema | `causet/states/greeting.state.causet` |
| Events | `causet/events/greeting.events.causet` |
| Intents | `causet/actions/greeting.actions.causet` |
| Projection | `causet/projections/greeting.projections.causet` |
| Queries | `causet/queries/greeting.queries.causet` |

## Prerequisites

- Causet CLI installed
- Local stack running **or** a hosted sandbox (`causet login`)
- Node.js 20+

## Setup

```bash
cd {{projectName}}
npm install --prefix app
cp .env.example .env   # edit platform / application if needed

```

Point the CLI at your environment, then compile and deploy:

```bash
# Local open mode
causet context use env local

# Compile Product DSL → IR
causet build compile --runtime causet --out dist

# Deploy to the sandbox fork
causet deploy --fork {{causetFork}} --yes
```

If deploy says a release already exists:

```bash
causet deploy activate --tag 1.0.0 --fork {{causetFork}} --mode FULL
```

## Walkthrough (browser)

Open the visual demo against your local API:

```bash
# from the project root (after deploy)
open demo.html
# or: python3 -m http.server 3457   → http://localhost:3457/demo.html
```

Use **Check connection**, then **Submit CREATE_GREETING**. The page highlights Intent → Event → Projection → Query and fills the greetings table.

Connection defaults match `.env.example` (`http://localhost:8085`, platform `test-platform`, fork `{{causetFork}}`).

## Walkthrough (CLI)

### 1. Create a greeting

```bash
causet intent CREATE_GREETING \
  --stream greeting_stream \
  --entity greet-1 \
  --payload '{"greeting_id":"greet-1","message":"Hello, Causet"}' \
  --fork {{causetFork}}
```

Empty messages are rejected in preflight (`EMPTY_MESSAGE`).

### 2. Inspect entity state

```bash
causet inspect timeline --entity greet-1 --stream greeting_stream --fork {{causetFork}}
```

### 3. Query the projection

Wait a moment for the projection worker, then:

```bash
causet query get_greeting --param greeting_id=greet-1 --fork {{causetFork}}
causet query list_greetings --fork {{causetFork}}
```

### 4. Update the greeting

```bash
causet intent UPDATE_GREETING \
  --stream greeting_stream \
  --entity greet-1 \
  --payload '{"greeting_id":"greet-1","message":"Hello again"}' \
  --fork {{causetFork}}

causet query get_greeting --param greeting_id=greet-1 --fork {{causetFork}}
```

You should see `updated_count` increment and `message` change.

## Walkthrough (TypeScript)

```bash
npm run dev --prefix app
```

The script submits `CREATE_GREETING` + `UPDATE_GREETING`, then runs `get_greeting` / `list_greetings` against your configured API.

Configure via `.env` (copy from `.env.example`):

| Variable | Default |
|----------|---------|
| `CAUSET_API_URL` | `http://localhost:8085` |
| `CAUSET_PLATFORM` | `test-platform` |
| `CAUSET_APPLICATION` | `{{packageName}}` |
| `CAUSET_FORK` | `{{causetFork}}` |

## Sample payloads

See `sample-intents/` for ready-made JSON bodies.

## Next steps

- Try `causet templates list` and scaffold **audit-log-api** (timeline + HTTP API).
- Add a second projection field or a `where` filter on `list_greetings`.
- Read the mental model: intents never wait on projections — design for eventual consistency on reads.
