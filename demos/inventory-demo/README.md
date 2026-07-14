# {{templateName}}

WarePark inventory — toggle **Legacy CRUD** vs **Causet retrofit** in one dashboard.

Project: **{{projectName}}** · Fork: `{{causetFork}}` · Env: `{{causetEnvironment}}`

Sourced from `inventory-modernization`.

## What you get

| Piece | Path |
|-------|------|
| Product DSL | `causet/` — RECEIVE / RESERVE / ADJUST / TRANSFER |
| Demo server + UI | `app/server`, `app/public` → http://localhost:3848 |
| Before/after snippets | `app/legacy/` |

```
Legacy: direct stock mutations + stale list cache
Causet: intents → inventory_position entity → projections → queries
```

## Setup

```bash
cd {{projectName}}
npm install --prefix app
cp .env.example .env

causet context use env local
causet build compile --runtime causet --out dist
causet deploy --fork {{causetFork}} --yes
npm run dev --prefix app
```

Open **http://localhost:3848**.

## Try it

1. Stay on **Legacy** — receive/reserve/transfer with the buggy cache behavior.
2. Switch to **Causet** — same buttons submit intents; stock + movements come from projection queries.
3. Watch the activity stream as intents complete.

No OpenAI key required. Optional `CAUSET_API_KEY` for hosted environments.
