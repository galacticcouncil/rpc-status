# rpc-status

Monitors the Hydration RPC fleet — gateways and the nodes behind them — from the
browser and from a server-side checker. Live at
[rpc-status.play.hydration.cloud](https://rpc-status.play.hydration.cloud).

Every round polls each endpoint in `endpoints.js`, takes the best block height
seen **per chain**, and grades each endpoint against it. **Responding is not the
same as being current**: an endpoint that answers in 40ms while serving
week-old state is reported stale, not up.

Heights are only ever compared within one chain. Mainnet endpoints share the
`hydration` chain; each testnet endpoint is its own chain unless endpoints are
explicitly tagged with a shared `chain` in `endpoints.js` — the lark forks and
paseo are independent, so comparing their heights would report all of them
stale.

## Running

```sh
npm install
npm run dev             # nodemon: build + serve on :3000
npm test                # node:test, no runner needed
npm run format:check
npm run docker:prometheus   # local Prometheus on :9090, 30d retention
```

Environment:

| Variable         | Default                  | Meaning                                                                    |
| ---------------- | ------------------------ | -------------------------------------------------------------------------- |
| `PORT`           | `3000`                   | HTTP port                                                                  |
| `CHECK_INTERVAL` | `5000`                   | ms between check rounds                                                    |
| `MAX_BLOCK_LAG`  | `10`                     | blocks behind the head before an endpoint is `stale` (~1 min at 6s blocks) |
| `PROMETHEUS_URL` | `http://prometheus:9090` | source for `/api/history`                                                  |

## `/api/status`

**Stable contract.** Third-party monitoring is expected to poll this. Adding
fields is fine; renaming or removing one is a breaking change and must bump
`version`.

```jsonc
{
  "version": 1,
  "generatedAt": "2026-08-17T08:15:10.406Z",
  "thresholds": { "maxBlockLag": 10 },
  "chainHead": { "hydration": 13655354, "paseo": 2919026, "lark4": 375801 },
  "endpoints": [
    {
      "name": "coke",
      "url": "https://subway.coke.hydration.cloud",
      "location": "SG",
      "kind": "gateway", // "gateway" (subway / LB) or "node"
      "network": "mainnet", // "mainnet" | "testnet", for filtering
      "chain": "hydration", // comparison group, keys into chainHead
      "status": "success", // did the RPC call itself succeed
      "health": "ok", // "ok" | "stale" | "error" — includes head lag
      "blockHeight": 13655354,
      "blockLag": 0, // blocks behind chainHead[chain], null if unknown
      "responseTime": 56.1, // ms
      "method": "chain_getBlock",
      "error": null,
      "checkedAt": "2026-08-17T08:15:10.406Z",
    },
  ],
}
```

Alert on `health != "ok"`, not on `status`. Block bodies are deliberately not
included — inlining them made this response ~1MB.

## `/metrics`

Prometheus exposition, scraped for the history charts:

| Metric                          | Labels             | Notes                                 |
| ------------------------------- | ------------------ | ------------------------------------- |
| `polkadot_rpc_status`           | `endpoint`, `name` | `1` only when healthy **and** current |
| `polkadot_rpc_block_lag`        | `endpoint`, `name` | blocks behind its own chain's head    |
| `polkadot_rpc_block_height`     | `endpoint`, `name` | last reported height                  |
| `polkadot_rpc_response_time_ms` | `endpoint`, `name` | last round trip                       |
| `polkadot_rpc_chain_head`       | `chain`            | best height seen this round           |

History retention is whatever the Prometheus instance is configured for; the
local helper script sets 30d.

## Check methods

`chain_getBlock` (default), `chain_getFinalizedHead`, `eth_blockNumber`,
`system_syncState`, `system_health`, `system_version`.

Gateways do not expose `system_syncState` (`-32601 Method not found`) — use
`system_health` or the head-lag grading for them, or whitelist the method in the
subway config.

## Layout

- `endpoints.js` — monitored endpoints, tagged `kind` and `testnet`
- `lag.js` — head-lag thresholds and grading, shared by browser and backend
- `status-contract.js` — `/api/status` serialisation
- `core-monitor.js` — the checker itself, runs in both browser and node
- `backend/server.js` — express, Prometheus metrics, SvelteKit SSR handler
- `src/` — SvelteKit UI
