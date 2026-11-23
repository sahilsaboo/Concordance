# Concordance

Brand-blind GLP-1 comparison on bias-rated, cited evidence. See [PLAN.md](PLAN.md).

| Folder | What | Run |
|---|---|---|
| `data/` | Claim matrix JSON, the contract between pipeline and web | — |
| `pipeline/` | Python 3.12 evidence pipeline (uv) | `cd pipeline && uv run pytest` |
| `web/` | Next.js app | `cd web && npm run dev` / `npm test` |

`data/sample_matrix.json` is placeholder data for building the UI. It is not real evidence.
