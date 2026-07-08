// json.mjs — generic JSON endpoint adapter.
//
// Config:
//   {
//     "type": "json",
//     "url": "https://example.com/api/jobs",
//     "root": "data.jobs",          // optional dotted path to the array
//     "map": {                       // which response keys map to our fields
//       "title": "name",
//       "company": "org.name",       // dotted paths supported
//       "location": "city",
//       "url": "apply_link",
//       "description": "summary"
//     },
//     "companyName": "Acme"          // optional constant if the feed omits it
//   }
//
// Zero-code way to add any REST/JSON job feed: point at the URL and describe the
// field mapping. No adapter file needed.

import { httpJson, normalizeJob } from './_lib.mjs';

export const type = 'json';

function dig(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

export async function fetch(cfg) {
  if (!cfg.url) throw new Error('json adapter needs a "url"');
  const data = await httpJson(cfg.url, { headers: cfg.headers });
  const arr = cfg.root ? dig(data, cfg.root) : Array.isArray(data) ? data : data.jobs || data.results || [];
  const map = cfg.map || {};
  const label = cfg.label || cfg.companyName || new URL(cfg.url).hostname;
  return (Array.isArray(arr) ? arr : []).map(row =>
    normalizeJob(
      {
        title: dig(row, map.title) ?? row.title,
        company: dig(row, map.company) ?? cfg.companyName ?? row.company,
        location: dig(row, map.location) ?? row.location,
        url: dig(row, map.url) ?? row.url ?? row.link,
        description: dig(row, map.description) ?? row.description,
        postedAt: dig(row, map.postedAt) ?? row.postedAt ?? null,
      },
      `json:${label}`,
    ),
  );
}
