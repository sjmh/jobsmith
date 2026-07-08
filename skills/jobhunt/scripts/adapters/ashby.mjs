// ashby.mjs — Ashby job boards.
//
// Config: { "type": "ashby", "company": "<board-name>" }
//   e.g. jobs.ashbyhq.com/<board>  ->  company: "<board>"
// Uses the public posting-api job-board endpoint; no auth.

import { httpJson, normalizeJob } from './_lib.mjs';

export const type = 'ashby';

export async function fetch(cfg) {
  const co = cfg.company;
  if (!co) throw new Error('ashby adapter needs a "company" board name');
  const data = await httpJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(co)}?includeCompensation=true`,
  );
  const label = cfg.label || co;
  return (data.jobs || []).map(j =>
    normalizeJob(
      {
        title: j.title,
        company: cfg.companyName || label,
        location: j.location || '',
        url: j.jobUrl || j.applyUrl,
        description: j.descriptionPlain || j.description || '',
        remote: j.isRemote === true ? true : undefined,
        postedAt: j.publishedAt || null,
      },
      `ashby:${label}`,
    ),
  );
}
