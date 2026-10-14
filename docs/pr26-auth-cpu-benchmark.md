# PR #26 auth CPU benchmark (wrangler dev / workerd)

Measured on Cloud Agent VM with `npx wrangler dev --port 8787 --local` (wrangler 4.147.0, preview D1 local).

Method: one new account; request header `X-Measure-Auth-Cpu: 1` returns `_benchmark` timings from inside the Worker isolate (`performance.now()` around PBKDF2 and full login handler). Wrangler `[wrangler:info]` lines report end-to-end wall time for the same requests.

| Endpoint | Wrangler wall | PBKDF2 (in-worker ms) | Notes |
|----------|---------------|------------------------|--------|
| `POST /api/register` | **58 ms** | **12 ms** (hash only) | Includes D1 batch + validation |
| `POST /api/login` | **23 ms** | **13 ms** PBKDF2, **20 ms** handler | Includes session token rotation |

## Workers Free 10 ms CPU limit

Cloudflare bills **CPU time** (not wall clock). PBKDF2 at **100 000** iterations alone measured **~12–13 ms** in workerd on this run — **above the Workers Free 10 ms CPU/request limit** for register/login even before D1 and validation work.

Paid Workers plans allow higher CPU per request; do not change product plans based on this note alone — ops should confirm on target tier before launch traffic.

Re-run locally:

```bash
npx wrangler dev --port 8787 --local
# separate terminal:
node scripts/measure-auth-cpu.mjs   # optional helper if added
```

Or send `X-Measure-Auth-Cpu: 1` on `/api/register` and `/api/login` and read JSON `_benchmark`.
