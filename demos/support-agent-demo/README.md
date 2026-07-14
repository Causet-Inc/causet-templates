# {{templateName}}

AI support copilot — ticket triage with decisions, memories, projections, and a live demo UI.

Project: **{{projectName}}** · Fork: `{{causetFork}}` · Env: `{{causetEnvironment}}`

Sourced from the `support-copilot` example app.

## What you get

| Piece | Path |
|-------|------|
| Product DSL | `causet/` (tickets, triage decision, memories, projections) |
| Visual demo | `demo.html` |

```
CREATE_TICKET
        │
        └─ AI triage decision
              ├─ priority / category / suggested reply
              └─ ticket_queue + customer projections → named queries
```

## Setup

```bash
cd {{projectName}}
npm install
cp .env.example .env

causet context use env local
causet secrets set openai --fork {{causetFork}}
causet build compile --runtime causet --out dist
causet deploy --fork {{causetFork}} --yes
```

## Run the demo

```bash
open demo.html
# Serve over HTTP (required for @causet/sdk bundle): python3 -m http.server 3457
```

Use **Live** mode, submit a ticket, and watch triage results land in the queue panel.

## CLI check

```bash
causet query ticket_queue --fork {{causetFork}}
```
