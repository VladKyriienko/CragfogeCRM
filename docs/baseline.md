# Quality baseline

Measured on the starting commit of the improvement plan (Phase 0), against local Postgres 16 and Redis (same services as CI).

| Check               | Result                |
| ------------------- | --------------------- |
| `bun run typecheck` | pass, about 29 s cold |
| `bun run lint`      | pass, about 13 s      |
| `bun run test`      | pass, about 40 s      |

## Tests

| Package         | Tests                                     |
| --------------- | ----------------------------------------- |
| apps/api        | 51 (17 files, unit and e2e via Supertest) |
| packages/shared | 13                                        |
| packages/db     | 9                                         |
| apps/web        | 2 (Playwright e2e is not run in CI)       |

## Coverage (`bun run test:coverage`)

| Package         | Lines | Branches |
| --------------- | ----- | -------- |
| apps/api        | 65.2% | 47.5%    |
| packages/shared | 81.1% | 22.2%    |
| packages/db     | 48.7% | 18.6%    |
| apps/web        | 0.1%  | 0%       |

Weakest API modules by line coverage: roles 14.5%, jobs 23.7%, storage 35%, email 40%, automations 46.8%, activities 47.3%, workspaces 53%. Records 66.4%, metadata 66.7%, billing 70.3%.

Web coverage only counts unit tests; the UI is exercised by Playwright, which does not feed this number.

Reports are written to `coverage/` in each package and uploaded as the `coverage` CI artifact. No thresholds are enforced yet (Phase 2.8).
