// remoteok.mjs — RemoteOK aggregator.
//
// Config: { "type": "remoteok" }   (optionally "tags": ["dev","backend"])
// Uses the public JSON feed at remoteok.com/api. The first element is metadata
// (a legal notice), so it is skipped.

import { httpJson, normalizeJob } from './_lib.mjs';

export const type = 'remoteok';

export async function fetch(cfg) {
  const rows = await httpJson('https://remoteok.com/api');
  const wantTags = (cfg.tags || []).map(t => t.toLowerCase());
  return (Array.isArray(rows) ? rows : [])
    .filter(r => r && r.id && r.position) // drop the leading metadata object
    .filter(r => {
      if (!wantTags.length) return true;
      const tags = (r.tags || []).map(t => String(t).toLowerCase());
      return wantTags.some(w => tags.includes(w));
    })
    .map(r =>
      normalizeJob(
        {
          title: r.position,
          company: r.company,
          location: r.location || 'Remote',
          url: r.url,
          description: r.description || '',
          remote: true,
          postedAt: r.date || null,
        },
        'remoteok',
      ),
    );
}
