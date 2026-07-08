# Sources reference — the pluggable job-source framework

Job sourcing is a **runner + adapters** design. `scripts/fetch-jobs.mjs` is the
runner: it reads `config.sources[]`, hands each entry to the adapter whose `type`
matches, and merges + dedupes the results. The runner has **zero** site-specific
logic — everything site-specific lives in `scripts/adapters/*.mjs`, and adapters
are **auto-discovered** from that directory (no central registry). So extending
coverage is either a config line or a one-file drop-in; it never touches the
runner.

## Adding a site — the common case is ZERO code

Add one object to `config.sources[]`. Pick the `type` that fits:

| `type` | Use for | Minimal config |
| --- | --- | --- |
| `greenhouse` | boards.greenhouse.io/**\<co\>** | `{ "type": "greenhouse", "company": "discord" }` |
| `lever` | jobs.lever.co/**\<co\>** | `{ "type": "lever", "company": "netflix" }` |
| `ashby` | jobs.ashbyhq.com/**\<co\>** | `{ "type": "ashby", "company": "openai" }` |
| `remoteok` | RemoteOK aggregator | `{ "type": "remoteok", "tags": ["golang"] }` |
| `weworkremotely` | WWR RSS category | `{ "type": "weworkremotely", "category": "remote-programming-jobs" }` |
| `hn-whoishiring` | HN monthly "Who is hiring?" | `{ "type": "hn-whoishiring", "keywords": ["backend","go","game"] }` |
| `json` | any REST/JSON job endpoint | `{ "type": "json", "url": "...", "map": { "title": "name", "url": "apply_link" } }` |
| `rss` | any Atom/RSS job feed | `{ "type": "rss", "url": "https://site/jobs.rss", "companyName": "Acme" }` |
| `html` | a listings page with regular markup | `{ "type": "html", "url": "...", "item": "li.job", "title": "a", "link": "a" }` |
| `webfetch` | **anything else — just a URL** | `{ "type": "webfetch", "url": "https://devquest.gg/jobs" }` |

Optional keys on any source: `"label"` (display name), `"companyName"` (constant
company when the feed omits it), `"enabled": false` (temporarily disable).

### The `webfetch` catch-all (how devquest.gg gets added)

`webfetch` is the "I don't want to think about structure" option. The runner
fetches the page and hands it to the skill as `pendingExtraction`; the jobhunt
SKILL then uses its `WebFetch` tool + a reasoning pass to pull out each posting.
That's why onboarding a brand-new site is literally:

```jsonc
{ "type": "webfetch", "url": "https://devquest.gg/jobs" }
```

Use `json`/`rss`/`html` instead when the site has a clean API/feed/markup — they're
cheaper and don't need an AI pass every run.

## Adding a site that needs bespoke code (rare)

Only when none of the generic types fit. Copy `scripts/adapters/_template.mjs` to
`scripts/adapters/<your-type>.mjs` and implement the contract:

```js
export const type = '<unique-slug>';                 // matches "type" in config
export async function fetch(cfg) { /* ... */ }        // -> normalizedJob[]
// (optional) export const requiresLLM = true;        // runner routes to pendingExtraction
```

- `cfg` is the matching `sources[]` entry.
- Return an array built with `normalizeJob(raw, sourceName)` from `_lib.mjs`
  (handles url canonicalization, HTML stripping, remote detection). Missing fields
  degrade gracefully.
- Throwing is safe — the runner logs it under `errors` and moves on.
- Drop the file in `adapters/` and it's live on the next run. No registration.

`_lib.mjs` gives you: `httpGet`, `httpJson`, `parseFeed` (RSS/Atom), `parseHtml` +
`select` + `nodeText` (tiny CSS-selector subset), `stripHtml`, `canonicalUrl`,
`looksRemote`, `normalizeJob`.

## Watched companies

`config.watchedCompanies` is separate from sources — it's a spotlight list, not a
source. Any sourced job whose company matches (case-insensitive contains) gets
`watched: true`, an optional `watchedScoreBump`, and top-of-page highlighting in
the digest. You still need a *source* that surfaces that company's jobs (e.g. add
its Greenhouse/Lever board to `sources[]`).

## Notes / limits

- **LinkedIn / Indeed** are intentionally unsupported here — they block automated
  access and require login, which breaks unattended runs. Prefer company ATS
  boards (Greenhouse/Lever/Ashby), aggregators, and web search.
- All adapters use Node's global `fetch` (Node 18+), no dependencies.
- Dedup is by stable id `sha1(company|title|canonicalUrl)`, computed in the runner
  and matched by the SKILL — so the same posting from two sources collapses to one.
