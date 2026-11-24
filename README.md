# Concordance

Brand-blind GLP-1 comparison on bias-rated, cited evidence. See [PLAN.md](PLAN.md).

| Folder | What | Run |
|---|---|---|
| `data/` | Claim matrix JSON, the contract between pipeline and web | — |
| `pipeline/` | Python 3.12 evidence pipeline (uv) | `cd pipeline && uv run pytest` |
| `web/` | Next.js app | `cd web && npm run dev` / `npm test` |

`data/sample_matrix.json` is placeholder data for building the UI. It is not real evidence.

## Deploying `web/`

Every page sits behind an "educational use only" notice, enforced on the server by `web/proxy.ts`.
Set `CONSENT_SECRET` in the host's environment variables (see `web/.env.example`); without it the site fails closed
and nobody can get past the notice. Changing `CONSENT_VERSION` in `web/lib/consent.ts` makes everyone accept again.
