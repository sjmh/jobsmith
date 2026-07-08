// rss.mjs — generic RSS / Atom job-feed adapter.
//
// Config:
//   { "type": "rss", "url": "https://site.com/jobs.rss", "companyName": "Acme" }
//
// Handles both RSS <item> and Atom <entry>. If feed titles are "Company: Role",
// set "splitTitleOnColon": true to split them.

import { httpGet, parseFeed, normalizeJob } from './_lib.mjs';

export const type = 'rss';

export async function fetch(cfg) {
  if (!cfg.url) throw new Error('rss adapter needs a "url"');
  const xml = await httpGet(cfg.url);
  const label = cfg.label || cfg.companyName || new URL(cfg.url).hostname;
  return parseFeed(xml).map(item => {
    let company = cfg.companyName || '';
    let title = item.title;
    if (cfg.splitTitleOnColon) {
      const idx = item.title.indexOf(':');
      if (idx > 0) {
        company = item.title.slice(0, idx).trim();
        title = item.title.slice(idx + 1).trim();
      }
    }
    return normalizeJob(
      {
        title,
        company,
        location: '',
        url: item.link,
        description: item.description || '',
        postedAt: item.pubDate,
      },
      `rss:${label}`,
    );
  });
}
