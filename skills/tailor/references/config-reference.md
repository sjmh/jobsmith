# `resume.config.json` reference

This file lives in the candidate's résumé workspace (the directory you run the
skill from, or a parent of it). It holds everything person-specific so the skill
itself stays generic. All fields have defaults; a minimal config only needs
`candidate.name` and `masterBank`.

```json
{
  "candidate": {
    "name": "Jane Doe",
    "contact": "jane@example.com | linkedin.com/in/janedoe | github.com/janedoe | Austin, TX"
  },
  "masterBank": "master/work-history.md",
  "profileSource": "master/profiles.md",
  "applicationsDir": "applications",
  "role": { "default": "Software Engineer" },
  "confidentiality": [
    "Never disclose <specific thing>; refer to it only as <approved phrasing>."
  ],
  "review": { "bar": 85, "maxRounds": 3, "panelSize": 4 },
  "signature": { "marker": "+" },
  "render": {
    "enabled": true,
    "command": "node {skillDir}/scripts/render-cv.mjs {cv} {out} --role \"{role}\"",
    "template": "{skillDir}/scripts/template.mjs"
  }
}
```

## Fields

| Field | Meaning | Default |
|---|---|---|
| `candidate.name` | Printed as the CV `# Name` header. **Required.** | — |
| `candidate.contact` | The `\|`-separated contact line under the name (links auto-detected). | `""` |
| `masterBank` | Path to the master experience bank — the source of truth bullets are pulled from verbatim. **Required.** | — |
| `profileSource` | Optional file of reusable, pre-approved summary paragraphs / per-job blurbs to reuse and lightly tailor. Omit if none. | none |
| `applicationsDir` | Where tailored applications are written (`<dir>/<slug>/`). | `applications` |
| `role.default` | Header sub-title / role printed on the CV. Always used verbatim — the header title is static and never mirrors the JD's posted title. | `Software Engineer` |
| `confidentiality` | List of hard rules (NDAs, "refer to X only as Y") the workflow must honour exactly. | `[]` |
| `review.bar` | Confidence threshold (0–100) every reviewer must clear. | `85` |
| `review.maxRounds` | Max review→rewrite rounds before shipping regardless. | `3` |
| `review.panelSize` | Number of reviewers on the panel. | `4` |
| `signature.marker` | Character that, inside a bank bullet's tag (e.g. `` `[Game +]` ``), flags a crown-jewel accomplishment that is **always** included on every CV. Set to `""` to disable the whole signature feature. | `"+"` |
| `render.enabled` | Whether to produce styled HTML + PDF. If `false`, the tailored `.md` is the deliverable. | `false` |
| `render.command` | Shell command template. `{skillDir}` `{cv}` `{out}` `{role}` are substituted. | bundled renderer |
| `render.template` | Styling module the renderer uses (edit to re-skin). | bundled `template.mjs` |

## Placeholders in `render.command`

- `{skillDir}` — the absolute path to this skill's directory, so the bundled
  renderer is found wherever the skill is installed. When installed as the
  `jobsmith` plugin this resolves to `${CLAUDE_PLUGIN_ROOT}/skills/tailor`; the
  setup step writes the concrete absolute path into the saved config.
- `{cv}` — path to the tailored `cv-optimised.md`.
- `{out}` — the output basename (no extension); `.html` and `.pdf` are written next to it.
- `{role}` — the resolved role string for the header.

A workspace that already has its own renderer (like a Puppeteer project) can point
`render.command` at that instead — the skill just runs whatever is configured.

## Signature bullets (crown jewels)

Some accomplishments are headline material regardless of the role — you want them
to appear on *every* CV even when their specialty is off from the target job. Mark
those in the master bank by putting `signature.marker` **inside the bullet's
tag** — with the default marker `+`:

```
- `[Game +]` Powered the game's free-to-play monetization as lead engineer...
- `[Backend · Game +]` Co-led the mobile platform that shipped three titles...
```

**Every marked bullet is always included on every CV** — no sampling, no ceiling.
The candidate marked them precisely because they're crown jewels that should show
up everywhere, even a `` `[Game +]` `` bullet on a backend CV. If many bullets are
marked, the skill trims ordinary bullets to make room rather than dropping any
signature bullet. The marker is part of the tag, so it is stripped (along with the
tag) when the bullet is placed, and the verbatim gate ignores it. Set
`signature.marker` to `""` to turn the feature off entirely.
