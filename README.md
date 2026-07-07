# jobsmith

A Claude Code plugin for **job applications**. Its first tool, `/jobsmith:tailor`,
tailors a résumé to a specific job by **selecting your own real accomplishments
verbatim** from a master experience bank (never inventing prose), then running the
draft through a 4-persona peer-review panel that scores confidence 0–100 and loops
the rewrite until every reviewer clears the bar.

Everything about *you* — name, master-bank location, confidentiality rules, whether
you want a styled PDF — lives in a per-workspace `resume.config.json` that the skill
creates interactively on first run. The plugin itself is generic and shareable.

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
    └── tailor/                        the /jobsmith:tailor skill
        ├── SKILL.md                   the workflow (draft → panel → loop → gate → render)
        ├── references/
        │   ├── setup.md               first-run interactive setup
        │   ├── config-reference.md    every resume.config.json field + defaults
        │   └── master-bank-template.md  starter template for your bullet bank
        └── scripts/
            ├── verbatim-check.js      anti-fabrication gate (bullets must be verbatim)
            ├── render-cv.mjs          optional Markdown→HTML→PDF renderer
            └── template.mjs           the single styling surface (edit to re-skin)
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
