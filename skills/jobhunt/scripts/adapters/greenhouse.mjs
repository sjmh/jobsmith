// greenhouse.mjs — Greenhouse job boards.
//
// Config: { "type": "greenhouse", "company": "<board-token>" }
//   e.g. boards.greenhouse.io/<company>  ->  company: "<company>"
// Uses the public board API; no auth. Returns every open posting for that board.

import { httpJson, normalizeJob } from './_lib.mjs';

export const type = 'greenhouse';

export async function fetch(cfg) {
  const co = cfg.company;
  if (!co) throw new Error('greenhouse adapter needs a "company" board token');
  const data = await httpJson(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(co)}/jobs?content=true`,
  );
  const label = cfg.label || co;
  return (data.jobs || []).map(j =>
    normalizeJob(
      {
        title: j.title,
        company: cfg.companyName || label,
        location: j.location?.name || '',
        url: j.absolute_url,
        description: j.content || '',
        postedAt: j.updated_at || j.first_published || null,
      },
      `greenhouse:${label}`,
    ),
  );
}
