# Wallets

Ledger-based wallets — open, fund, withdraw, and **send** via a two-phase commit envelope. No AI.

Project: **my-wallets** · Fork: `sandbox` · Env: `sandbox`

## How the demo is structured

```
app/public/
  index.html + styles.css     ← UI shell
  js/
    main.js                   ← wires the layers
    ui/                       ← DOM, tables, toasts, button bindings
    domain/                   ← open / fund / withdraw / transfer + optimistic store
    causet/                   ← thin wrapper around @causet/sdk
  vendor/causet-sdk.js        ← bundled browser ESM of @causet/sdk
causet/                       ← Product DSL (states, actions, envelope, projections)
```

```
UI ──intent──► domain/service ──client.emit──► @causet/sdk ──► Causet runtime
 ▲                    │                              │
 │                    └── client.runQuery ◄── projections ◄──┘
 │
 └── domain_event ◄── SDK connectStreams(SSE) ◄── causet-realtime
```

| Layer | Responsibility |
|-------|----------------|
| `ui/` | Forms, tables, toasts, activity log |
| `domain/` | Wallet flows, optimistic overlays, wait-for-projection |
| `causet/` + `@causet/sdk` | `emit`, `runQuery`, `connectStreams` (SSE/WebSocket) |
| `causet/*.causet` | Source of truth for intents, envelope, projections |

## Flow

```
OPEN_WALLET / FUND_WALLET / WITHDRAW_WALLET
        │  (single-wallet intents)
        ▼
  wallet entity (visible/balance) + movement events
        │
TRANSFER_START  ──commit envelope──►  source + dest + ledger
        │ prepare → prepared → commit (or abort / timeout)
        ▼
  wallet_balances · ledger_movements · transfer_index  (projections)
```

## Setup

```bash
cd my-wallets
npm install --prefix app
cp .env.example .env

causet context use env local
causet build compile --runtime causet --out dist
causet deploy --fork sandbox --yes

npm run dev --prefix app
# open http://localhost:3850
```

## Try it

1. **OPEN_WALLET** for `wallet-alice`
2. **FUND_WALLET** 10000 (cents)
3. **WITHDRAW_WALLET** 2500
4. **TRANSFER_START** alice → bob (opens bob if needed)

Watch balances and the append-only ledger update after each intent.

## CLI

```bash
causet intent OPEN_WALLET --stream wallet_stream --entity wallet-alice \
  --payload '{"wallet_id":"wallet-alice","owner":"alice","currency":"USD"}' --fork sandbox

causet intent FUND_WALLET --stream wallet_stream --entity wallet-alice \
  --payload '{"wallet_id":"wallet-alice","amount":10000,"reference":"paycheck","movement_id":"fund-1"}' \
  --fork sandbox

causet intent TRANSFER_START --stream transfer_stream --entity xfer-1 \
  --payload '{"transfer_id":"xfer-1","envelope_id":"xfer-1","seq":1,"from_wallet_id":"wallet-alice","to_wallet_id":"wallet-bob","amount":1500,"created_at":1710000000000}' \
  --fork sandbox

causet query list_wallets --fork sandbox
causet query wallet_ledger --param wallet_id=wallet-alice --fork sandbox
```

Amounts are integer **cents** (ledger-safe). Transfers use shadow staging (`pending_envelopes`) until commit.
