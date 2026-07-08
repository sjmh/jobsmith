# First-run setup

Run this only when there is no `jobhunt.config.json` in the workspace (or a
parent). Hold a short interactive conversation, then write the file and confirm
it. Keep it brief — offer sensible defaults and let the user accept them.

Collect, in order:

1. **Workspace & tailor command.** Confirm you're in the right workspace (where
   `applications/` and the master bank live). Ask which tailor command to invoke
   for qualifying jobs — default `/tailor-resume` (the local command), or
   `/jobsmith:tailor` if they use the plugin version. Ask for the master-bank path
   (default `master/master_work_history_tracked.md`) so scoring is grounded in
   what they can back.

2. **Sources.** Which boards to pull. Seed with tokenless aggregators
   (`remoteok`, `weworkremotely`, `hn-whoishiring`) and offer to add company ATS
   boards (`greenhouse`/`lever`/`ashby`) for employers they care about. Explain
   that adding more sites later is a one-line config entry (or `webfetch` for any
   URL) — point them at `sources-reference.md`. Do **not** offer LinkedIn/Indeed
   (blocked for automation).

3. **Search queries.** A few `WebSearch` queries describing the roles they want
   (e.g. "senior backend engineer remote go", "gameplay / engine engineer
   remote"). These broaden beyond the configured boards.

4. **Watched companies.** Employers to spotlight — highlighted and pinned in the
   digest, with an optional score bump (`watchedScoreBump`, default 5). Seed from
   companies they've already tailored for if useful.

5. **Rubric.** Present the four seed factors and default weights (role/seniority
   35, tech-stack 30, remote/location 20, comp/company 15) and let them reweight.
   Tell them factors are extensible later (append to `rubric.factors`). Ask for
   any **dealbreakers**: must-be-remote? disallowed locations? seniority floor
   (e.g. reject anything below Senior)? excluded keywords (e.g. "clearance
   required")? See `rubric-reference.md`.

6. **Score bar.** The auto-tailor threshold (`bar`, default **80** — conservative).
   Explain: at/above → a résumé is generated automatically; below → recorded with
   its score and reason. They can change it any time, and the digest has a live
   bar control to explore cutoffs.

7. **Data & server.** Data dir (default `job-hunt`) and digest port (default
   `8123`). Confirm whether to auto-start the digest server after each run.

Then **write `jobhunt.config.json`** (full shape in `config-reference.md`), show
it back, and continue to Step 0 to run the first hunt (or stop if they were only
setting up).

> When you write `render`/command paths that reference the plugin, resolve
> `${CLAUDE_PLUGIN_ROOT}/skills/jobhunt` to a concrete absolute path so an
> unattended `claude -p` run (which may not expand the variable) still works.
