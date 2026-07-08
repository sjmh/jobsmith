# Config reference — `jobhunt.config.json`

Lives in the workspace the hunt runs from (the same place `applications/` and the
master bank live). Created interactively on first run (see `setup.md`). All paths
may be absolute or relative to the config's directory.

## Full sample

```jsonc
{
  "bar": 80,                        // auto-tailor threshold, 0–100 (Step 4)
  "dataDir": "job-hunt",            // where jobs.json + the digest live
  "serverPort": 8123,               // local digest server port

  "sources": [                      // pluggable adapters — see sources-reference.md
    { "type": "greenhouse", "company": "discord" },
    { "type": "lever", "company": "netflix" },
    { "type": "remoteok", "tags": ["golang", "backend"] },
    { "type": "weworkremotely", "category": "remote-programming-jobs" },
    { "type": "hn-whoishiring", "keywords": ["backend", "go", "game", "engine"] },
    { "type": "webfetch", "url": "https://devquest.gg/jobs" }
  ],

  "searchQueries": [                // WebSearch queries the SKILL runs each morning
    "senior backend engineer remote go",
    "game engine / gameplay engineer remote"
  ],

  "watchedCompanies": ["Netflix", "Epic", "NVIDIA", "Anduril", "Riot"],
  "watchedScoreBump": 5,            // added to a watched job's score (capped 100)

  "rubric": {                       // see rubric-reference.md
    "factors": [
      { "key": "role",     "label": "Role & seniority", "weight": 35, "guidance": "…" },
      { "key": "stack",    "label": "Tech-stack match", "weight": 30, "guidance": "…" },
      { "key": "location", "label": "Remote / location", "weight": 20, "guidance": "…" },
      { "key": "company",  "label": "Comp & company",   "weight": 15, "guidance": "…" }
    ],
    "dealbreakers": {
      "requireRemote": false,
      "disallowedLocations": [],
      "seniorityFloor": "Senior",
      "seniorityCeiling": null,
      "excludeKeywords": ["clearance required"]
    }
  },

  "tailor": {
    "command": "/tailor-resume",    // the tailor slash-command/skill to invoke (Step 4)
    "workspace": ".",               // dir to run the tailor command from
    "masterBank": "master/master_work_history_tracked.md",  // ground truth for scoring
    "enabled": true                 // false = score & record but don't generate résumés
  }
}
```

## Field defaults

| Field | Required | Default |
| --- | --- | --- |
| `bar` | no | `80` |
| `dataDir` | no | `"job-hunt"` |
| `serverPort` | no | `8123` |
| `sources[]` | **yes** | — (empty = nothing to hunt) |
| `searchQueries[]` | no | `[]` |
| `watchedCompanies[]` | no | `[]` |
| `watchedScoreBump` | no | `0` |
| `rubric.factors[]` | **yes** | the four seed factors (see rubric-reference.md) |
| `rubric.dealbreakers` | no | all off / empty |
| `tailor.command` | no | `"/tailor-resume"` |
| `tailor.workspace` | no | `"."` |
| `tailor.masterBank` | no | none (scoring proceeds without bank grounding) |
| `tailor.enabled` | no | `true` |

## The data store — `<dataDir>/jobs.json`

A JSON **array** of job records (created on first run). One record per unique job
id, accumulated across days. Shape:

```jsonc
{
  "id": "…",                 // sha1(company|title|canonicalUrl).slice(0,16) — stable key
  "title": "…", "company": "…", "location": "…", "url": "…", "source": "greenhouse:discord",
  "watched": false,
  "firstSeen": "2026-07-07T…", "lastSeen": "2026-07-07T…",
  "score": 84,               // null for dealbreaker records
  "breakdown": [ { "key": "role", "label": "Role & seniority", "weight": 35, "score": 90 }, … ],
  "rationale": "Strong backend/Go fit, remote, comp undisclosed.",
  "decision": "tailored",    // "tailored" | "rejected" | "dealbreaker"
  "resumeDir": "applications/senior-backend-acme",
  "resumePdf": "applications/senior-backend-acme/Steven_Hajducko_CV_Acme.pdf",
  "status": "tailored",      // "new" | "tailored" | "applied" | "dismissed"
  "appliedAt": null, "dismissedAt": null
}
```

The digest server (`scripts/server.mjs`) is the only writer of `status`/`appliedAt`/
`dismissedAt` at runtime (Apply / Dismiss / Undo); the morning SKILL run writes
everything else. Both write atomically (temp + rename) to avoid clobbering.
