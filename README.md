# Causet Templates

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Validate](https://github.com/Causet-Inc/causet-templates/actions/workflows/validate.yml/badge.svg)](https://github.com/Causet-Inc/causet-templates/actions/workflows/validate.yml)

Official templates, quickstarts, and demos for building, running, and deploying [Causet](https://github.com/Causet-Inc/Causet) applications locally or on [Causet Cloud](https://causet.cloud).

The [Causet CLI](https://github.com/Causet-Inc/Causet/tree/main/apps/causet-cli) clones this repo by default (`templates_repo` in `~/.causet/config.json`).

## Contributing

We welcome improvements. See [CONTRIBUTING.md](CONTRIBUTING.md). Please read our [Code of Conduct](CODE_OF_CONDUCT.md). To report security issues, see [SECURITY.md](SECURITY.md).

---

## Repo layout

```
causet-templates/
  README.md
  LICENSE
  NOTICE
  registry.json           # catalog index for causet new / causet templates
  demos/                  # full demos with UI and app runners
  quickstarts/            # Product DSL tutorials (causet/ only)
  scripts/validate.mjs    # CI catalog checks
  .github/dependabot.yml  # weekly npm + Actions updates
```

Each template folder:

```
<folder>/
  template.json     # metadata — id, commands, secrets, causetFiles
  README.md         # template-specific walkthrough
  causet/           # Product DSL (.causet)
  app/              # Node runner or demo server (demos only)
  demo.html         # browser demo (demos only)
  sample-intents/   # JSON payloads for causet intent (optional)
  env.example       # copy to .env in scaffolded project (demos only)
  gitignore         # scaffolded as .gitignore by the CLI
```

---

## Prerequisites

| Requirement | Demos | Quickstarts |
|-------------|-------|-------------|
| [Causet CLI](https://github.com/Causet-Inc/Causet/tree/main/apps/causet-cli) | ✓ | ✓ |
| Node.js 20+ | ✓ | — |
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

### Use a local clone (development)

```bash
git clone https://github.com/Causet-Inc/causet-templates.git
cd causet-templates

export CAUSET_TEMPLATES_DIR="$PWD"
causet templates list
causet new wallets my-wallets
```

Or point the CLI at a `file://` URL:

```bash
export CAUSET_TEMPLATES_REPO="file://$(pwd)"
causet templates update
```

---

## Standard workflow

After `causet new <id> <name>`:

```bash
cd <project-name>

# Demos with app runners or browser bundles
npm install --prefix app          # or npm install at project root (see template README)
cp env.example .env                 # demos only; scaffold may use .env.example

causet context use env local
causet build compile --runtime causet --out dist
causet deploy --fork sandbox --yes

# Quickstarts: exercise via CLI (no app/ folder)
# Demos: run the UI or dev server (see template README)
```

---

## Catalog

| Id | Path | Category | OpenAI | Run after deploy |
|----|------|----------|--------|------------------|
| `ai-fraud-detection` | `demos/ai-fraud-detection-demo` | demo | ✓ | serve `demo.html` over HTTP |
| `support-agent` | `demos/support-agent-demo` | demo | ✓ | serve `demo.html` over HTTP |
| `inventory` | `demos/inventory-demo` | demo | — | `npm run dev --prefix app` → :3848 |
| `wallets` | `demos/wallet-demo` | demo | — | `npm run dev --prefix app` → :3850 |
| `hello-causet` | `quickstarts/hello-causet` | quickstart | — | CLI intents + queries |
| `audit-log-api` | `quickstarts/audit-log-api` | quickstart | — | CLI intents + queries |

---

## Per-template: load, deploy, run

### `hello-causet`

First app — intents → events → projections → queries (Product DSL only).

```bash
causet new hello-causet my-hello
cd my-hello
causet build compile --runtime causet --out dist
causet deploy --fork sandbox --yes
```

CLI:

```bash
causet intent CREATE_GREETING --stream greeting_stream --entity greet-1 \
  --payload '{"greeting_id":"greet-1","message":"Hello, Causet"}' --fork sandbox
causet query get_greeting --param greeting_id=greet-1 --fork sandbox
```

---

### `audit-log-api`

Append-only audit trail with timeline projections and named queries (Product DSL only).

```bash
causet new audit-log-api my-audit
cd my-audit
causet build compile --runtime causet --out dist
causet deploy --fork sandbox --yes
```

```bash
causet intent RECORD_ACTION --stream audit_entry_stream --entity entry-1 \
  --payload '{"entry_id":"entry-1","actor":"alice","action":"login","resource":"auth"}' --fork sandbox
causet query list_recent --fork sandbox
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
cd my-inventory && npm install --prefix app && cp env.example .env
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
npm run dev --prefix app
```

Open **http://localhost:3848**.

---

### `support-agent` (AI)

Ticket triage with decisions, memories, projections.

```bash
causet new support-agent my-support
cd my-support && npm install && cp env.example .env
causet secrets set openai --fork sandbox
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
# serve demo.html over HTTP — see template README
```

```bash
causet query ticket_queue --fork sandbox
```

---

### `ai-fraud-detection` (AI)

Card auth → AI fraud decision → branch events → dashboard.

```bash
causet new ai-fraud-detection my-fraud
cd my-fraud && npm install && cp env.example .env
causet secrets set openai --fork sandbox
causet build compile --runtime causet --out dist && causet deploy --fork sandbox --yes
# serve demo.html over HTTP — see template README
```

Use **Run** in the UI or:

```bash
causet intent CARD_TRANSACTION_AUTHORIZED \
  --payload-file sample-intents/card-transaction-authorized.json \
  --fork sandbox
```

---

## Demo vs quickstart

| Template | How to run | URL |
|----------|------------|-----|
| `hello-causet` | compile + deploy, then CLI | — |
| `audit-log-api` | compile + deploy, then CLI | — |
| `wallets` | `npm run dev --prefix app` | http://localhost:3850 |
| `inventory` | `npm run dev --prefix app` | http://localhost:3848 |
| `support-agent` | serve `demo.html` over HTTP | deploy first |
| `ai-fraud-detection` | serve `demo.html` over HTTP | deploy first |

**Quickstarts** are Product DSL only (`causet/`). **Demos** include UI and app runners — deploy before opening browser demos.

Browser demos use [`@causet/sdk`](https://www.npmjs.com/package/@causet/sdk) from npm (bundled under `vendor/`). Node demos use [`@causet/sdk-node`](https://www.npmjs.com/package/@causet/sdk-node).

---

## Environment variables

Copy `env.example` → `.env` in demo projects:

| Variable | Local default |
|----------|---------------|
| `CAUSET_API_URL` | `http://localhost:8085` |
| `CAUSET_QUERY_URL` | `http://localhost:8086` |
| `CAUSET_REALTIME_URL` | `http://localhost:8081` |
| `CAUSET_PLATFORM` | `local-platform` |
| `CAUSET_APPLICATION` | your app slug |
| `CAUSET_FORK` | `sandbox` |

AI demos: `causet secrets set openai --fork sandbox`.

---

## Add a template

1. Create `demos/my-demo/` or `quickstarts/my-demo/` with `template.json`, `README.md`, `causet/`, etc.
2. Add an entry to `registry.json` (`path` must match the folder).
3. Run `node scripts/validate.mjs`.
4. Open a pull request to `main`.

`template.json` shape — see any existing template or the [CLI metadata spec](https://github.com/Causet-Inc/Causet/tree/main/apps/causet-cli/internal/templates/metadata.go).

---

## Validate locally

```bash
node scripts/validate.mjs
```

This checks `registry.json`, template paths, `causetFiles`, and that npm dependencies do not use `file:` URLs.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `registry.json not found` | `causet templates update` |
| Path mismatch | `registry.json` `path` must match folder name (e.g. `demos/wallet-demo`) |
| Demo can’t connect | Deploy first; check `.env` platform / app / fork |
| AI demo fails | `causet secrets set openai --fork sandbox` |
| Empty query results | Wait for projection worker after intent |
| Browser demo blank | Serve over HTTP, not `file://`; run `npm run build:sdk` if SDK bundle missing |

```bash
causet doctor
causet local logs
```

---

## License

Apache-2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Copyright 2026 [Causet, Inc.](https://github.com/Causet-Inc)
