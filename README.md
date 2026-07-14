# Causet Templates

Official templates, quickstarts, and demos for building, running, and deploying [Causet](https://github.com/Causet-Inc/Causet) applications locally or on Causet Cloud.

**GitHub:** [https://github.com/Causet-Inc/causet-templates](https://github.com/Causet-Inc/causet-templates)

The Causet CLI clones this repo by default (`templates_repo` in `~/.causet/config.json`).

---

## Repo layout

```
causet-templates/
  README.md
  LICENSE
  registry.json           # catalog index for causet new / causet templates
  demos/                  # full demos with UI
  quickstarts/            # minimal tutorials
```

Each template folder:

```
<folder>/
  template.json     # metadata — id, commands, secrets, causetFiles
  README.md         # template-specific walkthrough
  causet/           # Product DSL (.causet)
  app/              # Node runner or demo server (optional)
  demo.html         # browser demo (optional)
  sample-intents/   # JSON payloads for causet intent (optional)
  env.example       # copy to .env in scaffolded project
```

---

## Prerequisites

| Requirement | Demos | Quickstarts |
|-------------|-------|-------------|
| [Causet CLI](https://github.com/Causet-Inc/Causet/tree/main/apps/causet-cli) | ✓ | ✓ |
| Node.js 20+ | ✓ | ✓ |
| Git | ✓ | ✓ |
| Docker + local stack | ✓ (`causet local up`) | optional |
| OpenAI API key | AI demos only | — |

### Start local Causet

```bash
causet local install    # first time
causet local up         # :8085 SaaS, :8086 query, :8081 realtime
causet context use env local
causet local status
```

---

## Load templates in the CLI

### Default (this repo)

```json
// ~/.causet/config.json
{
  "templates_repo": "https://github.com/Causet-Inc/causet-templates",
  "templates_ref": "main"
}
```

Refresh the cache:

```bash
causet templates update
causet templates list
causet templates info wallets
```

### Scaffold a project — `causet new`

Creates a **local folder** (no cloud app).

```bash
causet new                         # interactive
causet new wallets my-wallets
causet new hello-causet my-hello
causet new ai-fraud-detection my-fraud
```

### Use this repo directly (local dev)

```bash
export CAUSET_TEMPLATES_DIR=/Users/patrick.mcdonald/pats_tools/causet-templates
causet templates list
causet new wallets my-wallets
```

Or clone from disk when iterating:

```bash
export CAUSET_TEMPLATES_REPO=file:///Users/patrick.mcdonald/pats_tools/causet-templates
causet templates update
```

### Init starters (`causet init`)

DSL starters like `concert-app` are registered separately in the CLI’s `catalog.yaml` and may also live in this repo at the root (e.g. `concert-app/`). Use:

```bash
causet init my-app --template concert-app
causet init templates
```

---

## Standard workflow

After `causet new <id> <name>`:

```bash
cd <project-name>
npm install --prefix app
cp env.example .env    # scaffold copies as .env.example

causet context use env local
causet build compile --runtime causet --out dist
causet deploy --fork sandbox --yes

# Then run the demo or app (below)
```

---

## Catalog

| Id | Path | Category | OpenAI | Run after deploy |
|----|------|----------|--------|------------------|
| `ai-fraud-detection` | `demos/ai-fraud-detection-demo` | demo | ✓ | `open demo.html` |
| `support-agent` | `demos/support-agent-demo` | demo | ✓ | `open demo.html` |
| `inventory` | `demos/inventory-demo` | demo | — | `npm run dev --prefix app` → :3848 |
| `wallets` | `demos/wallet-demo` | demo | — | `npm run dev --prefix app` → :3850 |
| `hello-causet` | `quickstarts/hello-causet` | quickstart | — | `open demo.html` |
| `audit-log-api` | `quickstarts/audit-log-api` | quickstart | — | `npm run dev --prefix app` |

---

## Per-template: load, deploy, run

### `hello-causet`

First app — intents → events → projections → queries.

```bash
causet new hello-causet my-hello
cd my-hello
npm install --prefix app && cp .env.example .env
causet build compile --runtime causet --out dist
causet deploy --fork sandbox --yes
open demo.html
```

CLI:

```bash
causet intent CREATE_GREETING --stream greeting_stream --entity greet-1 \
  --payload '{"greeting_id":"greet-1","message":"Hello, Causet"}' --fork sandbox
causet query get_greeting --param greeting_id=greet-1 --fork sandbox
```

---

### `audit-log-api`

Append-only audit trail + timeline queries + HTTP API.

```bash
causet new audit-log-api my-audit
cd my-audit && npm install --prefix app && cp .env.example .env
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
npm run dev --prefix app
```

---

### `wallets`

Ledger wallets — fund, withdraw, two-phase transfers. Dev server + realtime SDK.

```bash
causet new wallets my-wallets
cd my-wallets && npm install --prefix app && cp .env.example .env
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
npm run dev --prefix app
```

Open **http://localhost:3850**.

```bash
causet intent OPEN_WALLET --stream wallet_stream --entity wallet-alice \
  --payload '{"wallet_id":"wallet-alice","owner":"alice","currency":"USD"}' --fork sandbox
```

See `sample-intents/` in the project. More detail: `demos/wallet-demo/README.md`.

---

### `inventory`

Legacy CRUD vs Causet retrofit — toggle in one UI.

```bash
causet new inventory my-inventory
cd my-inventory && npm install --prefix app && cp .env.example .env
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
npm run dev --prefix app
```

Open **http://localhost:3848**.

---

### `support-agent` (AI)

Ticket triage with decisions, memories, projections.

```bash
causet new support-agent my-support
cd my-support && npm install --prefix app && cp .env.example .env
causet secrets set openai --fork sandbox
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
open demo.html
```

```bash
causet query ticket_queue --fork sandbox
```

---

### `ai-fraud-detection` (AI)

Card auth → AI fraud decision → branch events → dashboard.

```bash
causet new ai-fraud-detection my-fraud
cd my-fraud && npm install --prefix app && cp .env.example .env
causet secrets set openai --fork sandbox
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
open demo.html
```

Use **Run** in the UI or:

```bash
causet intent CARD_TRANSACTION_AUTHORIZED \
  --payload-file sample-intents/card-transaction-authorized.json \
  --fork sandbox
```

---

## Demo vs app

| Template | How to run | URL |
|----------|------------|-----|
| `hello-causet` | `open demo.html` | static file |
| `audit-log-api` | `npm run dev --prefix app` | see app README |
| `wallets` | `npm run dev --prefix app` | http://localhost:3850 |
| `inventory` | `npm run dev --prefix app` | http://localhost:3848 |
| `support-agent` | `open demo.html` | static (deploy first) |
| `ai-fraud-detection` | `open demo.html` | static (deploy first) |

**Deploy before opening browser demos** — they call `http://localhost:8085` by default.

---

## Environment variables

Copy `env.example` → `.env` in your scaffolded project:

| Variable | Local default |
|----------|---------------|
| `CAUSET_API_URL` | `http://localhost:8085` |
| `CAUSET_QUERY_URL` | `http://localhost:8086` |
| `CAUSET_REALTIME_URL` | `http://localhost:8081` |
| `CAUSET_PLATFORM` | `local-platform` or `test-platform` |
| `CAUSET_APPLICATION` | your app slug |
| `CAUSET_FORK` | `sandbox` |

AI demos: `causet secrets set openai --fork sandbox`.

---

## Add a template

1. Create `demos/my-demo/` or `quickstarts/my-demo/` with `template.json`, `README.md`, `causet/`, etc.
2. Add an entry to `registry.json` (`path` must match the folder).
3. Push to `main`.
4. Users run `causet templates update`.

`template.json` shape — see any existing template or the [CLI metadata spec](https://github.com/Causet-Inc/Causet/tree/main/apps/causet-cli/internal/templates/metadata.go).

---

## Publish

```bash
cd /Users/patrick.mcdonald/pats_tools/causet-templates
git add .
git commit -m "Update templates"
git push origin main
```

Verify:

```bash
causet templates update
causet templates list
causet new wallets test-wallets
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `registry.json not found` | `causet templates update` |
| Path mismatch | `registry.json` `path` must match folder name (e.g. `demos/wallet-demo`) |
| Demo can’t connect | Deploy first; check `.env` platform / app / fork |
| AI demo fails | `causet secrets set openai --fork sandbox` |
| Empty query results | Wait for projection worker after intent |

```bash
causet doctor
causet local logs
```

---

## License

Apache-2.0 — see [LICENSE](LICENSE).
