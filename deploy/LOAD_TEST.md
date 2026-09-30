# Load test (k6)

Script: [`k6/crm-smoke.js`](./k6/crm-smoke.js).

## How to run

1. Start the stack (`bun run dev` or self-host compose).
2. Sign in, copy the session cookie and workspace id.
3. Run:

```bash
export BASE_URL=http://localhost:3000
export COOKIE='better-auth.session_token=…'
export WORKSPACE_ID='…'
k6 run deploy/k6/crm-smoke.js
```

k6 prints `records_list_ms`, `records_create_ms`, and `records_search_ms` including **p95**.

## Latest local result

k6 was not available in the Phase 8 CI/dev agent environment. Related smoke from
`bun --filter @cragfoge/db perf:records` (1M rows, same machine class as README Phase 3):

| Operation | p95 (ms) |
| --------- | -------- |
| list      | 1.4      |
| filter    | 1.6      |
| sort      | 146.3    |

Run the k6 script above on your VPS/laptop and replace this table with:

| Endpoint            | p95 (ms) |
| ------------------- | -------- |
| list people records | …        |
| create person       | …        |
| search people (`q`) | …        |

Thresholds in the script: list/search p95 &lt; 500 ms, create p95 &lt; 800 ms.

If k6 is not installed: `brew install k6`.
