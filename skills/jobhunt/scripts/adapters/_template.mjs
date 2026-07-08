// _template.mjs — copy this file to add a brand-new bespoke source adapter.
//
// WHEN YOU NEED THIS: only when a site doesn't fit the generic `json`, `rss`,
// `html`, or `webfetch` types. For most new sites, you don't write code at all —
// you just add a config entry (see references/sources-reference.md).
//
// HOW TO ADD ONE:
//   1. Copy this file to  <your-type>.mjs  in this same directory.
//   2. Set `type` to a unique slug (must match the "type" you'll use in config).
//   3. Implement fetch(cfg) to return an array of normalized job objects.
//   4. That's it — the runner auto-discovers every *.mjs in this folder, so
//      there is NO central registry to edit.
//
// CONTRACT:  export const type = '<slug>'
//            export async function fetch(cfg) -> normalizedJob[]
// A normalized job is whatever you pass through normalizeJob(); missing fields
// degrade gracefully. Throwing is fine — the runner logs and skips this source
// without aborting the whole run.

import { httpJson, normalizeJob } from './_lib.mjs';

export const type = 'example'; // <-- rename to your unique source type

export async function fetch(cfg) {
  // `cfg` is the matching entry from the config `sources[]` array, e.g.
  //   { "type": "example", "url": "https://api.example.com/jobs", ... }
  const data = await httpJson(cfg.url);

  return (data.jobs || []).map(j =>
    normalizeJob(
      {
        title: j.title,
        company: j.company || cfg.companyName,
        location: j.location,
        url: j.url,
        description: j.description,
        postedAt: j.posted_at || null,
      },
      `example:${cfg.label || 'example'}`,
    ),
  );
}
