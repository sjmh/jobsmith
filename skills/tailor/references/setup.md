# First-run setup (interactive)

Run this the first time the skill can't find a `resume.config.json`. The goal is
a short, friendly conversation that ends with a written config and a clear next
step. Don't interrogate — ask in small batches, offer sensible defaults, and let
the user accept them quickly. Use the AskUserQuestion tool for the choice-shaped
questions (rendering, styling) and plain prompts for free-text (name, paths).

## What to collect

1. **Name & contact line.** The name for the CV header, and a single contact
   line they want printed (email / LinkedIn / GitHub / location — their call).
   → `candidate.name`, `candidate.contact`.

2. **Master experience bank.** "Do you already keep a master file of all your
   work history and accomplishments to pull from?"
   - If **yes**: get the path. → `masterBank`.
   - If **no**: copy `references/master-bank-template.md` into their workspace
     (suggest `master/work-history.md`), set `masterBank` to it, and tell them
     the skill can't tailor anything until they fill it in with real bullets.
     Offer to help draft it from a CV/LinkedIn export they paste, in a separate
     pass. The bank is the whole foundation — one strong, verbatim-pullable bullet
     per accomplishment.

3. **Reusable profile copy (optional).** "Do you keep pre-written summary
   paragraphs or per-job blurbs you like to reuse?" If yes, get the path
   → `profileSource`. If no, omit it — the skill will write a grounded profile
   from bank facts.

4. **Output location & role.** Where tailored applications go (default
   `applications/`) → `applicationsDir`. The default header role/title to print
   → `role.default`. Ask whether the header should mirror each JD's posted title
   instead → `role.mirrorJobTitle`.

5. **Confidentiality rules (optional).** "Any NDAs or things you must describe a
   specific way (e.g. can't name an employer/product)?" Capture each rule
   verbatim as a list entry → `confidentiality`.

6. **Review bar.** Offer the defaults (bar 85, 3 rounds, 4 reviewers). Only change
   on request → `review`.

7. **Signature bullets (optional).** "Do you have a few crown-jewel accomplishments
   you'd want on *every* CV, even when the role's specialty is a bit off?" If yes,
   explain they mark those in the bank by putting the signature marker inside the
   bullet's tag (default `+`, e.g. `` `[Game +]` ``), and the skill will always
   carry 1–2 of them. Keep the defaults unless they want a different marker or
   floor/ceiling → `signature`. If they don't want the feature, set
   `signature.marker` to `""` (or omit the block and note it's off by default only
   when no marked bullets exist — the default marker is `+`).

8. **Rendering.** Ask: "Do you want a styled HTML + PDF, or just the Markdown CV?"
   - **Markdown only** → `render.enabled: false`. Done.
   - **Styled output** → `render.enabled: true`, and:
     - **Puppeteer:** the bundled renderer needs it for PDFs. Check whether it's
       available; if not, offer to run `npm install puppeteer` in their workspace.
       (Without puppeteer the renderer still writes HTML and skips the PDF — say so.)
     - **Style after a sample (optional):** "Want it styled after a résumé you
       like?" If yes, ask for a sample — a PDF/HTML/image or just a description of
       fonts and colours — and edit the design tokens at the top of
       `scripts/template.mjs` (`:root` variables + the `FONTS` link) to match.
       Keep it single-column and ATS-safe. If no, keep the neutral default.

## Writing the config

Fill any unset field with its default from `config-reference.md`. Write the JSON
to `resume.config.json` in the workspace root, then show it to the user and
confirm. For `render.command`, substitute the skill's real absolute directory for
`{skillDir}` (resolve `${CLAUDE_PLUGIN_ROOT}/skills/tailor` to its concrete
absolute path and write that) so the saved command works regardless of where the
plugin is installed.

Then continue to **Step 0** with the job description the user gave — or, if they
were only setting up, tell them setup is done and to re-run with a JD.
