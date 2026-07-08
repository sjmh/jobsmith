# Rubric reference

The rubric decides two things per job: **should we tailor a résumé for it** (the
score vs. the `bar`), and **why** (the per-factor breakdown + rationale shown in
the digest). It is intentionally *open*: you add or reweight factors in
`jobhunt.config.json` with no code change.

## Shape

```jsonc
"rubric": {
  "factors": [
    { "key": "role",     "label": "Role & seniority", "weight": 35,
      "guidance": "How closely the title, responsibilities, and level match the candidate's target tracks (Backend, Game). Wrong level (too junior/too senior) scores low even if the domain fits." },
    { "key": "stack",    "label": "Tech-stack match", "weight": 30,
      "guidance": "Overlap between the JD's required technologies and what the master bank can back verbatim. Reward the must-haves, not nice-to-haves." },
    { "key": "location", "label": "Remote / location", "weight": 20,
      "guidance": "Remote-friendly or in an acceptable location. Fully remote = high; acceptable hub = medium; on-site in a no-go location = low (but see dealbreakers)." },
    { "key": "company",  "label": "Comp & company",   "weight": 15,
      "guidance": "Disclosed comp vs. the candidate's floor, plus company size/reputation/mission fit. When comp isn't disclosed, judge on company signal alone and don't over-penalize." }
  ],
  "dealbreakers": {
    "requireRemote": false,
    "disallowedLocations": [],
    "seniorityFloor": null,
    "seniorityCeiling": null,
    "excludeKeywords": []
  }
}
```

Weights need not sum to 100 — they are **normalized** at scoring time, so adding a
5th factor with `weight: 10` just dilutes the others proportionally.

## Scoring method (Step 3)

1. For each factor, read its `guidance` and score the job **0–100** on that factor
   alone. Use the master bank (`config.tailor.masterBank`) as ground truth for the
   `role` and `stack` factors — score against what the candidate can *actually
   back*, not the job's appeal in the abstract.
2. Overall `score = round( Σ(factor.score × factor.weight) / Σ(factor.weight) )`.
3. Apply the watched-company bump if set (`+config.watchedScoreBump`, capped 100).
4. Emit `breakdown: [{ key, label, weight, score }]` and a one–two sentence
   `rationale`.

### Score anchors

- **90–100** — bullseye: right role, right level, stack the bank strongly backs,
  location fine. Tailor without hesitation.
- **80–89** — strong fit, minor gaps. **At/above the default `bar` → auto-tailor.**
- **60–79** — plausible but real gaps (level off, partial stack, location friction).
  Recorded, not tailored (unless the user lowers the bar).
- **< 60** — weak: wrong role/level or little stack overlap. Recorded with reasons.

## Dealbreakers (Step 2 — applied *before* scoring)

A dealbreaker is a hard filter; tripping any one records the job as
`decision:"dealbreaker"` with `score: null` and skips scoring entirely. Vocabulary:

| Field | Meaning |
| --- | --- |
| `requireRemote` | If `true`, non-remote jobs are dealbroken. |
| `disallowedLocations` | Array of substrings; a location match dealbreaks (e.g. `["On-site - "]`). |
| `seniorityFloor` / `seniorityCeiling` | Reject titles below/above a level (e.g. floor `"Senior"` rejects "Junior"/"New Grad"; ceiling `"Staff"` rejects "Director"/"VP"). |
| `excludeKeywords` | Array of substrings in title/description that auto-reject (e.g. `["clearance required","unpaid"]`). |

## Adding a new rule

- **New scoring factor** — append an entry to `rubric.factors` with a `key`,
  `label`, `weight`, and `guidance`. The skill scores every factor present; the
  digest shows every factor in the breakdown. No code change.
- **New hard filter** — most cases fit `excludeKeywords` / `disallowedLocations`.
  For genuinely new dealbreaker *logic*, add the field here and handle it in the
  SKILL's Step 2 (it reads whatever is in `dealbreakers`).
- **Change the cutoff** — set `config.bar` (0–100). The digest also has a live bar
  control to explore a different cutoff without re-running.
