# {{templateName}}

Card authorization → AI `fraud_screening` → branch events → projections → queries.

Project: **{{projectName}}** · Fork: `{{causetFork}}` · Env: `{{causetEnvironment}}`

## What you get

| Piece | Path |
|-------|------|
| Product DSL | `causet/` (actions, decisions, events, projections, queries, sagas) |
| Visual demo | `demo.html` |
| Sample intent | `sample-intents/card-transaction-authorized.json` |

```
CARD_TRANSACTION_AUTHORIZED
        │
        ├─ core: persist transaction
        └─ side_effects: decision fraud_screening
              ├─ BLOCK / REVIEW / ALLOW branch events
              └─ projections → fraud_dashboard, risk profile, timeline queries
```

## Setup

```bash
cd {{projectName}}
npm install --prefix app
cp .env.example .env

causet context use env local   # or causet login
causet secrets set openai --fork {{causetFork}}
causet build compile --runtime causet --out dist
causet deploy --fork {{causetFork}} --yes
```

## Run the demo

```bash
open demo.html
# or: python3 -m http.server 3457 → http://localhost:3457/demo.html
```

Connection defaults: `http://localhost:8085` · `local-platform` · `{{packageName}}` · `{{causetFork}}`.

Click **Run** on a sample transaction (Tokyo + velocity is designed to trigger BLOCK). Watch the intent, AI decision, emits, and query panels update.

## CLI check

```bash
causet intent CARD_TRANSACTION_AUTHORIZED \
  --stream transaction_stream \
  --entity txn_demo_1 \
  --payload "$(cat sample-intents/card-transaction-authorized.json)" \
  --fork {{causetFork}}

causet query fraud_dashboard --fork {{causetFork}}
```
