// lever.mjs — Lever job boards.
//
// Config: { "type": "lever", "company": "<account>" }
//   e.g. jobs.lever.co/<account>  ->  company: "<account>"
// Uses the public postings API (mode=json); no auth.

import { httpJson, normalizeJob } from './_lib.mjs';

export const type = 'lever';

export async function fetch(cfg) {
  const co = cfg.company;
  if (!co) throw new Error('lever adapter needs a "company" account name');
  const data = await httpJson(
    `https://api.lever.co/v0/postings/${encodeURIComponent(co)}?mode=json`,
  );
  const label = cfg.label || co;
  return (Array.isArray(data) ? data : []).map(j =>
    normalizeJob(
      {
        title: j.text,
        company: cfg.companyName || label,
        location: j.categories?.location || '',
        url: j.hostedUrl || j.applyUrl,
        description: j.descriptionPlain || j.description || '',
        remote: /remote/i.test(j.categories?.location || '') || undefined,
        postedAt: j.createdAt || null,
      },
      `lever:${label}`,
    ),
  );
}
