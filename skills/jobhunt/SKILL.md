---
name: jobhunt
description: >-
  Run a daily job hunt: source fresh postings from job boards (pluggable
  adapters + web search), score each against a configurable, extensible fit
  rubric, and for every job that clears the score bar auto-tailor the candidate's
  résumé (via the configured tailor command). Records everything in a persistent
  jobs.json and serves a local morning-digest webpage (new today / résumé-ready /
  applied / rejected-with-score) with Apply buttons. Use when the user asks to
  find/scan/hunt for jobs, run the morning digest, or set up an automated daily
  job search. Everything person-specific lives in a per-workspace
  jobhunt.config.json this skill creates on first run.
---

# Daily Job Hunt + Morning Digest

This skill is the front end to the résumé-tailoring workflow: instead of the
candidate finding jobs by hand, it **sources → dedupes → scores → auto-tailors →
records → presents** a daily digest. It is designed to run either interactively
or unattended (a morning cron via `run-daily.ps1` → `claude -p "/jobhunt"`).

Its two governing principles:

1. **Never re-surface a job twice.** Every posting gets a durable id; a job is
   only ever "new" once, no matter how many mornings it keeps appearing at the
   source.
2. **Only tailor what's worth tailoring.** A configurable rubric scores fit
   0–100; résumés are auto-generated only for jobs at or above the `bar`. Below
   the bar, the job is recorded with its score and the reason, so the user can
   see *why* it was skipped.

---

## How this skill is configured

Everything person-specific — which sources to pull, which companies to watch, the
rubric factors and weights, the score bar, which tailor command to invoke, where
the data store lives — is read from a **`jobhunt.config.json`** in the working
directory (or the nearest parent that has one). The workflow below is identical
for everyone; only the config differs.

**Before doing anything else, look for `jobhunt.config.json`** (current directory,
then walk up).
- **If it exists**, read it and proceed to Step 0.
- **If it does not exist**, run **Step −1 (First-run setup)** to create it.

The full field list and defaults are in `references/config-reference.md`. The
rubric contract is in `references/rubric-reference.md`; the source framework and
how to add a site are in `references/sources-reference.md`.

---

## Step −1 — First-run setup (only when there is no config)

Follow `references/setup.md`. Hold a brief interactive conversation to learn the
candidate's sources, watched companies, rubric, bar, and tailor command, then
**write `jobhunt.config.json`** and confirm it back. Do not run a hunt without a
config — you would be guessing what "a good fit" means.

---

## Step 0 — Source jobs

Run the source **runner**, which dispatches every configured `sources[]` entry to
its adapter and prints normalized jobs as JSON:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/jobhunt/scripts/fetch-jobs.mjs <path/to/jobhunt.config.json>
```

The runner's stdout is one JSON object: `{ jobs, pendingExtraction, errors }`.

1. **`jobs`** — already normalized and deduped by stable id. Each is
   `{ id, title, company, location, url, source, remote, postedAt, description }`.
2. **`pendingExtraction`** — `webfetch`-type sources the runner fetched but could
   not structure (irregular sites, e.g. a new board like devquest.gg). For each
   entry, **use your `WebFetch` tool** on its `url` (the runner also included a
   `pageText` fallback) and **extract** the postings yourself into the same job
   shape, then add them to the job list. This is what makes adding a brand-new
   site as easy as one config line.
3. **`errors`** — sources that failed; mention them briefly in the final summary
   but never abort the run over them.

**Then broaden with web search.** For each query in `config.searchQueries`, use
your `WebSearch` tool, and for promising hits use `WebFetch` to confirm the
posting and extract `{title, company, location, url}`. Fold these into the job
list. (Search complements the adapters; it catches postings on boards you haven't
configured an adapter for.)

Compute each newly-found job's id the same way the runner does:
`sha1(lowercased "company|title|canonicalUrl").slice(0,16)` — so search hits and
adapter hits dedupe against each other and against history.

## Step 1 — Dedupe against history (stable IDs)

Load the data store at `<config.dataDir>/jobs.json` (create `[]` if absent). Build
a set of known ids. For every sourced job:

- **Known id** → update its `lastSeen` to today; do **not** re-score or re-surface
  it. (This is the guard that stops the same posting reappearing every morning.)
- **New id** → mark it "new today" (set `firstSeen`/`lastSeen`, `status:"new"`)
  and carry it into scoring.

Flag `watched: true` on any job whose company matches `config.watchedCompanies`
(case-insensitive contains) — these get spotlighted in the digest regardless of
score.

## Step 2 — Dealbreaker gate

For each new job, apply `config.rubric.dealbreakers` (hard filters — e.g.
`requireRemote`, disallowed locations, seniority floor/ceiling, excluded
keywords). If a job trips any dealbreaker, record it with `decision:"dealbreaker"`,
a `rationale` naming which rule, `score: null`, and skip scoring. See
`references/rubric-reference.md` for the dealbreaker vocabulary.

## Step 3 — Score against the rubric

For each surviving new job, score fit **0–100** using `config.rubric.factors` (the
extensible weighted-factor array). For every factor, judge the job on that
factor's `guidance` and give it a 0–100 sub-score; the overall score is the
weight-normalized average. Read `references/rubric-reference.md` for the exact
scoring method and anchors, and read the candidate's master bank
(`config.tailor.masterBank`, if set) so tech-stack/role judgements reflect what
they can actually back.

Produce for each job:
- `score` (0–100, integer),
- `breakdown`: `[{ key, label, weight, score }, …]` (per-factor sub-scores),
- `rationale`: one or two sentences on the score.

Apply the watched-company bump if configured (`config.watchedCompanies` /
`watchedScoreBump`), capped at 100.

## Step 4 — Tailor the winners

For every job with `score >= config.bar` (default 80), generate a tailored résumé
by running the configured tailor workflow. **Spawn one subagent per qualifying job**
with the Agent tool (`subagent_type: "general-purpose"`), bounded to a few at a
time, each instructed to:

- run `config.tailor.command` (default `/tailor-resume`) against the job — passing
  the JD text (or its URL) as the argument — from `config.tailor.workspace`
  (default: the current workspace),
- return the created application directory and the résumé file paths.

Record on the job: `decision:"tailored"`, `status:"tailored"`, `resumeDir`,
`resumePdf`, and (if the tailor step reports them) the tailor panel's final scores.

Jobs below the bar get `decision:"rejected"` and keep their score + rationale so
the digest can explain the skip. **Never tailor a below-bar job** unless the user
explicitly asks.

> If `config.tailor.command` is empty or tailoring is disabled, skip generation
> and just record the decision — the digest still shows what *would* have been
> tailored.

## Step 5 — Persist & serve the digest

1. **Merge** all results back into `<config.dataDir>/jobs.json` — append new
   records, update `lastSeen`/status on existing ones. **Never drop history.**
   Write atomically (temp file + rename) so a concurrent digest server never reads
   a half-written file.
2. **Ensure the digest server is running.** Check `config.serverPort` (default
   8123); if nothing is listening, start it detached:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/skills/jobhunt/scripts/digest-server.mjs <dataDir>/jobs.json --config jobhunt.config.json --port <serverPort>
   ```
3. **Report** a one-screen summary: counts (new today / tailored / rejected /
   dealbreaker / errors), the watched-company hits, the top few tailored jobs with
   their scores and résumé paths, and the digest URL
   (`http://localhost:<serverPort>`).

## Guardrails

- **Idempotent:** running twice in a day must not duplicate jobs, re-score seen
  jobs, or regenerate résumés that already exist. Dedupe on id first, always.
- **Don't fabricate postings.** Every job must trace to a real URL from a source
  or a search hit. If extraction is uncertain, drop the job rather than invent
  fields.
- **Respect the tailor skill's own rules.** Tailoring is delegated wholesale to
  `config.tailor.command`; do not reach into the master bank or write résumé prose
  here.
- **Fail soft on sources.** A dead board, a rate-limit, or a parse error is a
  logged `error`, never a reason to abort the morning run.
- **Keep the data store portable.** `jobs.json` is the single source of truth for
  the digest; the server only ever reads/writes that file.
