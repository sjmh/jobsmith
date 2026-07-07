# tailor-resume — a Claude Code skill

Tailor a résumé to a specific job by **selecting your own real accomplishments
verbatim** (never inventing prose), then running the draft through a 4-persona
peer-review panel that scores confidence 0–100 and loops the rewrite until every
reviewer clears the bar. Everything about *you* lives in one config file, so the
skill is generic and shareable.

## Install

Copy the whole `tailor-resume/` folder into your skills directory:

- **Per-user (all projects):** `~/.claude/skills/tailor-resume/`
- **Per-project:** `<project>/.claude/skills/tailor-resume/`

That's it — Claude Code discovers it automatically. No dependencies are required
unless you opt into PDF rendering (then: `npm install puppeteer` in your résumé
workspace).

## Use

From your résumé workspace, ask Claude to tailor your CV, e.g.:

```
Tailor my résumé for this job: <paste JD text, a file path, or a URL>
```

**First run:** there's no `resume.config.json` yet, so the skill walks you
through a short setup (your name, where your master experience bank lives,
optional NDA rules, whether you want styled HTML/PDF and what to style it after)
and writes the config. After that, every run just tailors.

## What's in here

| Path | What it is |
|---|---|
| `SKILL.md` | The workflow Claude follows (draft → panel → loop → gate → render → report). |
| `references/setup.md` | The first-run interactive setup script. |
| `references/config-reference.md` | Every `resume.config.json` field + defaults. |
| `references/master-bank-template.md` | Starter template for your master bullet bank. |
| `scripts/verbatim-check.js` | Anti-fabrication gate — fails if any CV bullet isn't verbatim in your bank. |
| `scripts/render-cv.mjs` | Optional self-contained Markdown→HTML→PDF renderer. |
| `scripts/template.mjs` | The single styling surface — edit this to re-skin. |

## The core idea

Your **master bank** (one file) holds every accomplishment as a tight, verbatim
bullet. Tailoring = *choosing which real bullets and skills to feature for this
job*, never writing new claims. A `verbatim-check` gate enforces that mechanically,
and the reviewer panel makes sure the selection actually sells you for the role.
Good bullets in the bank ⇒ good tailored CVs out.
