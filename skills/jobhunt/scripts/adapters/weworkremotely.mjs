// weworkremotely.mjs — We Work Remotely RSS feeds.
//
// Config: { "type": "weworkremotely", "category": "remote-programming-jobs" }
//   Defaults to the programming category. Any WWR RSS category slug works, or
//   pass a full "url" to override.
// WWR feed titles look like "Company: Job Title" — split on the first colon.

import { httpGet, parseFeed, normalizeJob } from './_lib.mjs';

export const type = 'weworkremotely';

export async function fetch(cfg) {
  const url =
    cfg.url ||
    `https://weworkremotely.com/categories/${cfg.category || 'remote-programming-jobs'}.rss`;
  const xml = await httpGet(url);
  return parseFeed(xml).map(item => {
    let company = '';
    let title = item.title;
    const idx = item.title.indexOf(':');
    if (idx > 0) {
      company = item.title.slice(0, idx).trim();
      title = item.title.slice(idx + 1).trim();
    }
    return normalizeJob(
      {
        title,
        company,
        location: 'Remote',
        url: item.link,
        description: item.description || '',
        remote: true,
        postedAt: item.pubDate,
      },
      'weworkremotely',
    );
  });
}
