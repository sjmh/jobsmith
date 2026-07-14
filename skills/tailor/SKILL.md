---
name: tailor
description: >-
  Tailor a résumé/CV to a specific job description by SELECTING verbatim bullets
  from the candidate's own master experience bank (never inventing prose), then
  running the draft through a 4-persona peer-review panel that scores confidence
  0–100 and looping the rewrite until every reviewer clears the bar (or a round
  cap). Use when the user asks to tailor/optimise/customise their CV or résumé
  for a job, application, or posting. Works for any candidate and any field —
  everything person-specific lives in a per-workspace resume.config.json, which
  this skill will create interactively on first run.
---

# Tailor Résumé with a Peer-Review Loop

This skill produces an application-ready, tailored résumé for **one** job. Its
governing principle is **anti-fabrication**: the résumé is *assembled by
selecting* real, verbatim accomplishments from the candidate's own master
experience bank — never by writing new claims, metrics, or titles. A reviewer
panel then pressure-tests the draft until it genuinely advances *this* candidate
for *this* role.

The job description (text, a file path, or a URL) arrives in `$ARGUMENTS`.

---

## How this skill is configured

Everything person-specific — the candidate's name, where their master bank
lives, confidentiality rules, the review bar, whether to render a PDF — is read
from a **`resume.config.json`** in the working directory (or the nearest parent
that has one). This file is what makes the skill generic and shareable: the
workflow below is identical for everyone; only the config differs.

**Before doing anything else, look for `resume.config.json`** (check the current
directory, then walk up). 
- **If it exists**, read it and proceed to Step 0.
- **If it does not exist**, run **Step −1 (First-run setup)** to create it. Do
  not attempt to tailor a résumé without a config — you would have to guess the
  candidate's identity and their source of truth, which defeats the point.

The full field list and defaults are in `references/config-reference.md`.

---

## Step −1 — First-run setup (only when there is no config)

Follow `references/setup.md`. In short, hold a brief interactive conversation to
learn who the candidate is and where their material lives, then **write
`resume.config.json`** and confirm it back. You will collect:

1. **Candidate identity** — name and a one-line contact string (email, LinkedIn,
   GitHub, location — whatever they want in the header).
2. **Master bank** — the path to their master experience file (the source of
   truth to pull bullets from). If they don't have one, scaffold it from
   `references/master-bank-template.md` and tell them to fill it in before the
   first real run.
3. **Reusable profile copy** *(optional)* — a file of pre-approved summary
   paragraph(s) / per-job blurbs to reuse **verbatim** (same tagline on every
   CV), if they keep one.
4. **Output location** — the directory tailored applications get written to
   (default `applications/`), and the default header role/title to print.
5. **Confidentiality rules** *(optional)* — any NDA / "refer to X only as Y"
   constraints, captured verbatim as a list the workflow must honour.
6. **Review bar** — score threshold (default **85**), max rounds (default **3**),
   panel size (default **4**).
7. **Rendering** — ask whether they want styled **HTML + PDF** output or just
   Markdown. If they want rendering:
   - Offer to install Puppeteer (`npm install puppeteer` in the workspace, or
     confirm it's already available) — this skill bundles a self-contained
     renderer at `scripts/render-cv.mjs`, no other project files needed.
   - Offer to **style it after an existing résumé** they like: ask for a sample
     (PDF, HTML, image, or a description of fonts/colours), then edit
     `scripts/template.mjs`'s design tokens to match. Otherwise the clean
     neutral default template is used.
   - If they decline rendering, set `render.enabled` to `false`; the skill stops
     at Markdown.

Write the config, show it to them, then continue to Step 0 with the JD they
provided (or ask for one if they were only setting up).

---

## Step 0 — Ingest the job

1. Resolve `$ARGUMENTS`: a file path → read it; a URL → fetch it (WebFetch);
   otherwise treat it as pasted JD text. If no JD was given, ask for one and stop.
2. Extract and note (in the conversation, not a file): role title, seniority,
   the domain/specialty, must-have skills, and the top 5–8 things this employer
   is optimising for.
3. Choose a kebab-case application **slug** from the role + company (e.g.
   `staff-backend-acme`) and create `<applicationsDir>/<slug>/` if absent.

## Step 1 — Draft the CV

Assemble `<applicationsDir>/<slug>/cv-optimised.md`. First **read one existing
tailored CV** in `<applicationsDir>/*/` if any exist, to match the exact
Markdown shape the renderer expects; otherwise follow this structure:

```
# Candidate Name
email | linkedin.com/in/handle | github.com/handle | City, ST

## PROFILE
<one grounded paragraph>

## SKILLS
**Category:** comma-separated skills
...

## EXPERIENCE
### Company | Location | Dates
**Job Title**
<optional one-line blurb>
- <verbatim accomplishment bullet>
- ...

## PERSONAL PROJECTS
- **Name:** verbatim description
```

Rules for the draft (these are the heart of the skill):

- **Bullets are pulled VERBATIM from the master bank.** Never reword, merge,
  split, or invent a bullet. If the bank tags bullets with `` `[tag]` `` markers,
  strip the tag when placing the bullet. Select the bullets that best hit this
  JD's priorities.
- **Signature bullets (crown jewels).** If `config.signature.marker` is set
  (default `+`) and non-empty, a bank bullet's tag may carry the marker to flag a
  standout accomplishment. There are **two tiers**, by how many times the marker
  appears in the tag:
  - **Mandatory — marker doubled (`++`).** A tag containing the marker *twice in a
    row* (e.g. `` `[Backend · Game ++]` ``) is **always included on every assembled
    CV — no exceptions — even when its track is off from the target role.** Every
    `++` bullet goes in; there is no cap. These are the candidate's defining
    accomplishments, marked precisely because they want them everywhere. If several
    exist, trim ordinary bullets to make room rather than dropping any.
  - **Priority — marker once (`+`).** A tag containing a *single* marker (e.g.
    `` `[Game +]` ``) is a high-priority "highlight" bullet: **strongly prefer it**
    when choosing which bullets to feature. The CV should carry **at least
    `config.signature.min` (default 1) and at most `config.signature.max`
    (default 2)** of these, preferring on-track ones — a soft floor that keeps a
    headline accomplishment present. Unlike `++` bullets, a `+` bullet *may* be
    left off if it is genuinely off-track and space is tight. `++` bullets do not
    count toward this `+` min/max.

  Strip the whole marker (single or double) along with the tag when placing a
  bullet, and place signatures where they read best (usually near the top of their
  role).
- **Skills** are printed **verbatim from the candidate's master skill block** —
  never invent, reword, rename, merge, or cherry-pick. The master skill section
  is the curated default (the candidate maintains it); the CV reproduces it
  as-is, category labels and all, just like the profile/tagline. The **only**
  change allowed is **dropping whole categories that are clearly off the role's
  track** (e.g. omit a "Game Development" category on a backend résumé, or a
  backend-only category on a gameplay résumé). Do **not** trim, reorder, or
  select individual items within a kept category, invent new categories,
  reshuffle skills between lines, or add a skill the JD mentions but the bank
  lacks. If the skills section feels wrong for a role, the fix is to edit the
  master skill block, not to re-tailor it here.
- **Personal projects** (if the bank has them) are **all** included, verbatim
  (tag stripped) — the bank's project list is a small curated set, so include
  every entry, not a subset. Only drop one if the page is genuinely overflowing.
- **Profile paragraph:** if a reusable-profile source is configured, use the
  closest-matching copy **verbatim — do not reword or re-tailor it to the JD.**
  The profile (tagline) stays identical across every CV of that track; only the
  track selection (e.g. backend vs. game) may differ. If no profile source is
  configured, write one that restates *only facts already present in the bank* —
  no new claims, metrics, or titles — and reuse that same text on later CVs.
- **Header role/title:** always use `config.role.default` verbatim. **Never
  change it to match the JD's posted title** — the header title is static.
- **Confidentiality:** honour every rule in `config.confidentiality` exactly.
- Keep it to roughly one page of content — cut to the most relevant bullets.
- **Continuous employment dates — trim from the oldest end.** When cutting roles
  to save space, drop whole roles from the **oldest** end of a company's history,
  never from the middle: dropping a middle role leaves a visible gap between the
  role dates on either side, whereas oldest-first drops stay invisible (the
  earlier span is simply not detailed). A role you keep only for continuity but
  have nothing to feature may be listed as a **title + dates line with no
  bullets** — never invent or pad filler bullets just to keep a role's dates on
  the page.

Also write `<applicationsDir>/<slug>/cv.config.json` if the renderer expects one
(role title + output basename), matching the pattern of existing applications.

Keep a running note of any JD requirement the bank **cannot back with a verbatim
bullet** — these become master-bank *suggestions* at the end. Never paper over a
gap by writing a new bullet.

## Step 2 — Peer-review panel (parallel)

Launch **`panelSize` reviewers in parallel** with the Agent tool
(`subagent_type: "general-purpose"`) — one message, N calls. Give each reviewer:
the full JD text, the **path** to the current `cv-optimised.md`, and the **path**
to the master bank. **Instruct every reviewer to Read both files themselves** so
any bullet swap they propose names a real, verbatim bank bullet (not a paraphrase).

**Record each reviewer's `agentId`** — you resume these same agents in later
rounds so each judges the revision against its own prior bar.

Each reviewer returns **exactly** this block and nothing else:

```
CONFIDENCE: <0–100>
TOP CONCERNS (ordered, most important first):
1. <concern> — <why it matters for THIS job> — <concrete, rule-compliant fix>
2. ...
STRENGTHS: <1–2 lines>
```

**Tell every reviewer how to score CONFIDENCE:**
- It measures how strongly *this CV — as the best rule-compliant version the
  master bank can honestly support* — advances **this** candidate for **this**
  role. Not the candidate's raw fit in the abstract.
- Anchors: **90–100** ready to ship, top third proves the role; **85–89** strong,
  minor polish only; **70–84** real fixable weaknesses (name them); **<70** major
  relevance/positioning problems.
- **Do not keep taxing the score for a gap that is genuinely unfixable by
  swapping in a different verbatim bullet/skill** (the bank simply lacks evidence
  for a JD must-have). Once such a gap is surfaced as a master-bank suggestion,
  treat it as *noted and accepted* and score the CV on what the bank *can* back —
  otherwise the loop can never converge. Still list it under concerns, flagged as
  an unfixable bank gap, so it stays visible.

Every fix a reviewer proposes must be achievable by **selecting different
verbatim bullets/skills or re-tailoring the profile copy — never by writing new
prose.** Tell them so explicitly. A reviewer scores **≥ bar** only when the CV
would genuinely advance this candidate for this role.

If the signature feature is on, **tell reviewers about the signature bullets**:
the CV deliberately carries every **mandatory** (`++`) crown-jewel bullet plus a
soft floor of **priority** (`+`) highlights, and some of them *may* be off the
role's exact track by design. Reviewers must not penalise the CV for including a
mandatory `++` bullet, even a slightly off-track one — those are required, not a
choice to second-guess. They *may* flag whether the *right* `+` priority bullets
were chosen (that tier is discretionary).

**The panel personas** (universal 1–3; #4 is domain-matched to the JD):

1. **Hiring manager** for this exact role. Does the top third prove they can do
   *this* job? Seniority signal, scope/impact, relevance density, red flags.
   Would you interview them?
2. **Senior peer** who'd work alongside them. Technical/professional credibility,
   depth vs. buzzword salad, real substance vs. over/under-claiming.
3. **Recruiter / ATS screener.** Keyword coverage vs. the JD, parseability,
   title/seniority match, 6-second skimmability, obvious auto-filters.
4. **Domain specialist inferred from the JD** — a senior practitioner in this
   role's specialty (backend/platform, gameplay, data, design, PM, finance,
   whatever the JD is). Cares about domain-specific substance and whether the
   emphasised bullets are the right ones for this specialty.

## Step 3 — Rewrite

Collect all scores. If any reviewer scored **below the bar**:

1. Reconcile their concerns (note conflicts; hiring-manager + specialist win ties
   on *content emphasis*, recruiter wins ties on *keyword/parse* issues).
2. Rewrite `cv-optimised.md` addressing them **only by swapping in different
   verbatim bullets, reselecting skills, or re-tailoring the profile
   lead/closing** — never by authoring new bullet prose or inventing claims.
   Re-check every Step 1 rule.
3. Record any concern that **cannot** be fixed within the rules (bank lacks the
   evidence) as a master-bank suggestion for Step 5.

## Step 4 — Loop until the bar is cleared (cap = maxRounds)

Repeat Steps 2–3 on the revised CV. **From round 2 on, resume the SAME reviewer
agents via `SendMessage` (using the `agentId`s from Step 2)** — tell each what
changed and ask it to re-verdict against its own prior concerns. Only spawn fresh
if an agent is unavailable.

Stop when **every reviewer scores ≥ the bar** (the *lowest* score clears it), or
after **`maxRounds`** rounds — whichever first. Between rounds, give the user one
line: each reviewer's score (e.g. `HM 88 · Peer 90 · ATS 86 · Spec 82`) and the
headline concern that drove the rewrite.

If the final round still has a reviewer below the bar, proceed but clearly report
the final scores, who fell short and by how much, and why (usually: the bank
can't back it verbatim → it's a master-bank suggestion).

## Step 5 — Verbatim gate, render & report

1. **Anti-fabrication gate (mandatory, before rendering):** run the bundled
   checker (it lives in the `scripts/` directory beside this SKILL.md — when
   installed as a plugin that path is `${CLAUDE_PLUGIN_ROOT}/skills/tailor/scripts`):
   ```
   node ${CLAUDE_PLUGIN_ROOT}/skills/tailor/scripts/verbatim-check.js <masterBankPath> <applicationsDir>/<slug>/cv-optimised.md
   ```
   It confirms every EXPERIENCE bullet and PERSONAL PROJECTS entry is verbatim
   from the master bank (profile/blurbs are exempt from this gate — they are
   reused verbatim from the profile source, not tailored).
   If it exits non-zero, **do not render**: replace each flagged line with a
   genuine verbatim bank bullet (or remove it) and re-run until clean. A drift
   here means a bullet was silently reworded or invented — the exact failure this
   skill exists to prevent.
2. **Render** only if `render.enabled` is true: run the configured render command
   (default `node ${CLAUDE_PLUGIN_ROOT}/skills/tailor/scripts/render-cv.mjs
   <cv.md> <output-basename> --role "<role>"`) and confirm the HTML + PDF were
   written. If rendering is disabled, the tailored `.md` is the deliverable.
3. **Report** to the user:
   - Final panel scores (round count, each reviewer's closing confidence, whether
     all cleared the bar).
   - Paths to the generated `.md` (and `.html`/`.pdf` if rendered).
   - **Master-bank suggestions** — a separate, clearly-labelled list of the
     bullets/skills the JD wanted but the bank couldn't back verbatim, phrased as
     suggested *additions to the master bank* (with any proposed tags). **Do not
     write these into the CV or the master bank** — they are recommendations for
     the user to approve later.

## Guardrails

- Never fabricate experience, metrics, titles, or dates to satisfy a reviewer or
  a JD. A gap the bank can't support is a master-bank suggestion, not a licence
  to invent.
- Never edit the master bank (or any `config.confidentiality`-protected material)
  during this workflow — suggestions only, delivered at the end.
- Never send or quote the raw master bank outside this workspace; it is an
  internal source-of-truth dump, not an application artifact.
- Keep the CV to ~one page of content; don't rely on print CSS to hide bloat.
- If reviewers keep demanding something the bank can't support, escalate it to
  Step 5 — don't paper over it with new prose.
