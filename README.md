# jobsmith

A Claude Code plugin for **job applications**. Two skills:

- **`/jobsmith:tailor`** — tailors a résumé to a specific job by **selecting your
  own real accomplishments verbatim** from a master experience bank (never inventing
  prose), then running the draft through a 4-persona peer-review panel that scores
  confidence 0–100 and loops the rewrite until every reviewer clears the bar.
- **`/jobsmith:jobhunt`** — a daily job hunt that **sources** fresh postings from job
  boards, **scores** each against a configurable, extensible fit rubric,
  **auto-tailors** your résumé for every job that clears the score bar, and serves a
  local **morning digest** webpage tracking what's new, what got a résumé (with an
  Apply button), what you've applied to, and what was rejected and why.

Everything about *you* — name, master-bank location, sources, rubric, confidentiality
rules — lives in per-workspace config files (`resume.config.json`, `jobhunt.config.json`)
the skills create interactively on first run. The plugin itself is generic and shareable.

## The daily job hunt

Run it by hand or on a schedule:

```
/jobsmith:jobhunt
```

First run walks you through setup (sources to pull, companies to watch, the rubric +
score bar, which tailor command to use) and writes `jobhunt.config.json`. Each run
then: sources → dedupes (stable ids, so a posting is only ever "new" once) →
dealbreaker-gates → scores → auto-tailors anything at/above the bar → records to
`job-hunt/jobs.json` → serves the digest at `http://localhost:8123`.

**Adding job sites is easy** — sourcing is a runner + auto-discovered adapters
(`skills/jobhunt/scripts/adapters/`). Most sites are a one-line config entry
(`greenhouse`/`lever`/`ashby`/`remoteok`/`weworkremotely`/`hn-whoishiring`/`json`/`rss`/`html`),
and any URL at all works via the `webfetch` catch-all (e.g.
`{ "type": "webfetch", "url": "https://devquest.gg/jobs" }`). See
`skills/jobhunt/references/sources-reference.md`.

**The rubric is extensible** — add or reweight scoring factors in
`jobhunt.config.json` with no code change. See `skills/jobhunt/references/rubric-reference.md`.

**Scheduling** — point a cron (e.g. the installed Hermes agent) at a wrapper that runs
`claude -p "/jobsmith:jobhunt"` from your résumé workspace each morning.

## Install

```
/plugin marketplace add https://github.com/sjmh/jobsmith
/plugin install jobsmith
```

Then, from your résumé workspace:

```
/jobsmith:tailor <paste a job description, a file path, or a JD URL>
```

**First run** has no `resume.config.json` yet, so the skill walks you through a
short setup (your name, where your master bullet bank lives, optional NDA rules,
whether you want styled HTML/PDF and what to style it after) and writes the config.
After that, every run just tailors.

PDF rendering is optional and only needs `puppeteer` (`npm install puppeteer` in
your résumé workspace); without it you still get the tailored Markdown + HTML.

## Layout

```
jobsmith/                              (this repo — plugin + single-plugin marketplace)
├── .claude-plugin/
│   ├── plugin.json                    plugin manifest (name: jobsmith)
│   └── marketplace.json               marketplace catalog (source ./)
└── skills/
    ├── tailor/                        the /jobsmith:tailor skill
    │   ├── SKILL.md                   the workflow (draft → panel → loop → gate → render)
    │   ├── references/
    │   │   ├── setup.md               first-run interactive setup
    │   │   ├── config-reference.md    every resume.config.json field + defaults
    │   │   └── master-bank-template.md  starter template for your bullet bank
    │   └── scripts/
    │       ├── verbatim-check.js      anti-fabrication gate (bullets must be verbatim)
    │       ├── render-cv.mjs          optional Markdown→HTML→PDF renderer
    │       └── template.mjs           the single styling surface (edit to re-skin)
    └── jobhunt/                       the /jobsmith:jobhunt skill
        ├── SKILL.md                   the daily pipeline (source → dedupe → score → tailor → digest)
        ├── references/
        │   ├── setup.md               first-run interactive setup
        │   ├── config-reference.md    every jobhunt.config.json field + the jobs.json schema
        │   ├── rubric-reference.md    the extensible scoring rubric + dealbreakers
        │   └── sources-reference.md   the pluggable source framework + how to add a site
        └── scripts/
            ├── fetch-jobs.mjs         the source runner (dispatches to adapters, dedupes)
            ├── server.mjs             the local digest web server (port 8123)
            └── adapters/              one auto-discovered module per source type
```

## The core idea

Your **master bank** (one file) holds every accomplishment as a tight, verbatim
bullet. Tailoring = *choosing which real bullets and skills to feature for this
job*, never writing new claims. A `verbatim-check` gate enforces that mechanically,
and the reviewer panel makes sure the selection actually sells you for the role.
Good bullets in the bank ⇒ good tailored CVs out.

## Updating

Push changes to this repo; users refresh with `/plugin marketplace update jobsmith`
and `/plugin update jobsmith`. (No `version` is pinned in the manifest, so every
commit is treated as a new version.)
