# PR #26 auth CPU benchmark (wrangler dev / workerd)

Environment: `npx wrangler dev --port 8787 --local` (wrangler 4.147.0, preview D1 local).

Header: `X-Measure-Auth-Cpu: 1` → JSON `_benchmark.pbkdf2_ms` (in-isolate `performance.now()` around PBKDF2 at **100 000** iterations).

Run: `node scripts/measure-auth-cpu.mjs` (requires dev server up).

## Latest sample (workerd local)

| Path | PBKDF2 ms | Handler ms (where reported) |
|------|-----------|-----------------------------|
| `POST /api/register` | **12** | — |
| `POST /api/login` | **12** | **19** |
| `POST /api/set-password` | **12** | **18** |

## Workers Free 10 ms CPU limit

Each login and set-password spends **~12 ms** in PBKDF2 alone in workerd — **above the Workers Free 10 ms CPU/request limit** (before D1 and other handler work). Paid tiers allow higher CPU; no plan changes in this PR.

Migration reference: `migrations/0017_account_password.sql` (after `0016_sync_clamp_backups.sql` from PR #25).
