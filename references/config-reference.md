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
  "role": { "default": "Software Engineer", "mirrorJobTitle": false },
  "confidentiality": [
    "Never disclose <specific thing>; refer to it only as <approved phrasing>."
  ],
  "review": { "bar": 85, "maxRounds": 3, "panelSize": 4 },
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
| `role.default` | Header sub-title / role printed on the CV. Used verbatim. | `Software Engineer` |
| `role.mirrorJobTitle` | If `true`, use the JD's posted title instead of `role.default`. | `false` |
| `confidentiality` | List of hard rules (NDAs, "refer to X only as Y") the workflow must honour exactly. | `[]` |
| `review.bar` | Confidence threshold (0–100) every reviewer must clear. | `85` |
| `review.maxRounds` | Max review→rewrite rounds before shipping regardless. | `3` |
| `review.panelSize` | Number of reviewers on the panel. | `4` |
| `render.enabled` | Whether to produce styled HTML + PDF. If `false`, the tailored `.md` is the deliverable. | `false` |
| `render.command` | Shell command template. `{skillDir}` `{cv}` `{out}` `{role}` are substituted. | bundled renderer |
| `render.template` | Styling module the renderer uses (edit to re-skin). | bundled `template.mjs` |

## Placeholders in `render.command`

- `{skillDir}` — the absolute path to this skill's directory (so the bundled
  renderer is found wherever the skill is installed).
- `{cv}` — path to the tailored `cv-optimised.md`.
- `{out}` — the output basename (no extension); `.html` and `.pdf` are written next to it.
- `{role}` — the resolved role string for the header.

A workspace that already has its own renderer (like a Puppeteer project) can point
`render.command` at that instead — the skill just runs whatever is configured.
