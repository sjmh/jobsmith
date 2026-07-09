---
name: jobhunt
description: >-
  Run a daily job hunt: source fresh postings from job boards (pluggable
  adapters + optional Indeed/MCP + web search), reconcile them against yesterday's
  run so only genuinely-new postings are surfaced, score each new one against a
  configurable, extensible fit rubric, and (unless autoTailor is off) tailor the
  candidate's résumé for jobs that clear the bar. Records everything in a
  persistent jobs.json and serves a local morning-digest webpage. Use when the
  user asks to find/scan/hunt for jobs, run the morning digest, or set up an
  automated daily job search. Everything person-specific lives in a per-workspace
  jobhunt.config.json this skill creates on first run.
---

# Daily Job Hunt + Morning Digest

The front end to résumé tailoring: instead of the candidate finding jobs by hand,
this **sources → reconciles → scores → (optionally tailors) → serves a digest**
every morning, either interactively or unattended (a cron via `run-daily.ps1` →
`claude -p "/jobsmith:jobhunt"`).

Two governing principles:

1. **Only ever surface a posting once.** Every posting has a durable id. Each run
   *merges against the existing jobs.json* — postings seen before keep their state
   (score, cart, dismissed) and are NOT re-scored; only genuinely-new ids are
   marked "new today" and scored. Re-running the same day is a no-op.
2. **Only score/tailor what's worth it.** New postings are dealbreaker-gated and
   relevance-screened first; survivors are scored 0–100 by the rubric; those at or
   above `bar` are "qualified" (and tailored, if `autoTailor` is on).

The heavy lifting is in deterministic scripts (`scripts/*.mjs`); this skill
orchestrates them and does the two LLM-shaped steps (extracting webfetch/MCP
postings, and scoring new candidates).

---

## Configuration

Everything person-specific is read from **`jobhunt.config.json`** (current dir,
then walk up). If absent, run **Step −1** (`references/setup.md`) to create it.
Full field list: `references/config-reference.md`. Key blocks this skill honors:

- `sources[]` — adapter sources (see `references/sources-reference.md`).
- `mcpSources[]` — MCP-tool sources queried agent-side in Step 0 (e.g. Indeed).
- `searchQueries[]` — open-web WebSearch queries (skipped when empty).
- `rubric` — `factors[]` (weighted, extensible) + `dealbreakers` (hard filters).
- `bar` (qualify threshold), `nearWindow`, `autoTailor`, `watchedCompanies` /
  `watchedScoreBump`, `comp`, `locationPref` (feed scoring).
- `dataDir`, `serverPort`, `tailor.{command,workspace,masterBank,enabled}`.

Throughout, let `WS` = the config's directory, `DATA` = `WS/<dataDir>` (default
`job-hunt`), `JOBS` = `DATA/jobs.json`, `PLUGIN` = `${CLAUDE_PLUGIN_ROOT}/skills/jobhunt`.

---

## Step −1 — First-run setup (only when there is no config)

Follow `references/setup.md`: a short interactive pass, then write
`jobhunt.config.json` and confirm it. Don't hunt without a config.

## Step 0 — Source postings into one incoming list

Gather from every enabled channel, normalize to
`{title, company, location, url, source, remote, postedAt, description, comp?}`,
and write the combined array to `DATA/_incoming.json`.

1. **Adapters** — run the runner and take its `jobs`:
   ```
   node PLUGIN/scripts/fetch-jobs.mjs WS/jobhunt.config.json
   ```
   Fold `jobs[]` into the incoming list. For each `pendingExtraction` entry
   (webfetch-type), use your **WebFetch** tool on its `url` and extract postings
   into the same shape. Note `errors[]` for the final summary; never abort on them.
2. **MCP sources** — for each `config.mcpSources[]` with `enabled !== false`
   **whose MCP tools are actually connected this session**, call its tool (e.g.
   Indeed `search_jobs`) once per `queries[]` entry (with its `location`), and
   normalize each hit (title, company, location, apply url, and comp when given).
   Skip a source whose tools aren't connected; never enable a disabled one.
3. **Open-web search** — only if `config.searchQueries` is non-empty: run each via
   **WebSearch**, confirm promising hits with **WebFetch**, add them.

Write the merged, normalized array to `DATA/_incoming.json`.

## Step 1 — Reconcile against history (the idempotency step)

```
node PLUGIN/scripts/merge-jobs.mjs JOBS --incoming DATA/_incoming.json \
     --config WS/jobhunt.config.json --candidates-out DATA/_to-score.json
```

This rewrites `JOBS`: postings seen before keep `firstSeen`/`cart`/`dismissed`/
`status`/`score`/`decision` and just get `lastSeen` bumped (`isNew=false`); brand-new
ids are stamped `firstSeen=today`, `isNew=true`, and routed — dealbreaker →
`decision:"dealbreaker"`, off-target → `decision:"rejected"` (score 25), otherwise
written to `DATA/_to-score.json` as candidates. Relay its stderr line (seen-again
vs new counts) to the user.

## Step 2 — Score the NEW candidates only

Read `DATA/_to-score.json`. **If empty, skip to Step 3** (nothing new today).
Otherwise score each candidate 0–100 per the rubric. For any sizeable set, split
across a few **`general-purpose` subagents in parallel**; give each: the candidate
batch, the path to `config.tailor.masterBank`, and the scoring brief below. Read
`references/rubric-reference.md` for the method.

Scoring brief (pass verbatim, filled from config):
- Score each `config.rubric.factors[]` 0–100 by its `guidance`; overall =
  weight-normalized average. Ground `role`/`stack` in the master bank — credit only
  tech the bank can back.
- Use `config.comp` (target/floor) for the comp factor when a posting discloses
  pay; otherwise judge on company signal, don't over-penalize.
- Use `config.locationPref` (`remotePreferred`, `willingToRelocate`,
  `relocationTolerance` 0..1) to lift on-site location sub-scores rather than zeroing
  them.
- Do **not** add the watched bump (apply-scores does that).
- Return **only** a JSON array: `[{ "id", "score", "breakdown":[{"key","score"}],
  "rationale" }]`, every candidate once.

Concatenate the subagents' arrays into `DATA/_scores.json`.

## Step 3 — Apply the scores

```
node PLUGIN/scripts/apply-scores.mjs JOBS --scores DATA/_scores.json \
     --config WS/jobhunt.config.json
```

This finalizes each newly-scored record: watched bump, `near` flag, breakdown
labels from config, and `decision` = `qualified` (score ≥ bar) or `rejected`.

## Step 4 — Tailor the winners (only if `autoTailor` is on)

If `config.autoTailor === false`: **skip** — the digest offers a one-click tailor
command per qualified job; nothing is generated unattended.

Otherwise, for each **new** job with `decision === "qualified"` and
`config.tailor.enabled !== false`: spawn a `general-purpose` subagent that runs
`config.tailor.command` (default `/jobsmith:tailor`) against the JD from
`config.tailor.workspace`, returning the application dir + résumé paths. Set that
record's `decision:"tailored"`, `status:"tailored"`, `resumeDir`, `resumePdf`.
Never tailor already-tailored or below-bar jobs.

## Step 5 — Serve the digest & report

1. **Ensure the digest server is up** on `config.serverPort` (default 8124); if
   nothing is listening, start it detached:
   ```
   node PLUGIN/scripts/digest-server.mjs JOBS --config WS/jobhunt.config.json --port <serverPort>
   ```
2. **Report** one screen: **new today** (isNew) vs seen-again, qualified count,
   near-miss count, watched hits, dealbreaker/off-target counts, any source
   `errors`, the top few qualified jobs (score + company + résumé path if tailored),
   and the digest URL. Point out that "new today" is now meaningful — it excludes
   everything carried over from prior runs.

## Guardrails

- **Idempotent by construction:** Step 1 dedups on id and never re-scores or
  duplicates seen postings; running twice a day changes nothing. Never bypass
  merge-jobs by overwriting `JOBS` directly.
- **Preserve user state:** `cart`, `dismissed`, `status`, and prior scores set via
  the digest survive every run — merge-jobs carries them over. Don't clobber them.
- **Don't fabricate postings.** Every job traces to a real URL from an adapter,
  MCP hit, or search hit. If extraction is uncertain, drop it.
- **Fail soft on sources.** A dead board / rate-limit / parse error is a logged
  `error`, never a reason to abort.
- **Tailoring is delegated** to `config.tailor.command`; don't write résumé prose
  or touch the master bank here.
- The `_incoming.json`, `_to-score.json`, `_scores.json` files in `DATA` are
  scratch for the run; `jobs.json` is the single source of truth.
