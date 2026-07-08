// hn-whoishiring.mjs — Hacker News "Ask HN: Who is hiring?" monthly thread.
//
// Config: { "type": "hn-whoishiring", "keywords": ["backend","go","game"] }
// Finds the latest "Who is hiring?" story via the Algolia HN Search API, pulls
// its top-level comments (each is one job post), and keeps those matching any
// keyword. Company/title/url are extracted heuristically from the comment text.

import { httpJson, stripHtml, normalizeJob } from './_lib.mjs';

export const type = 'hn-whoishiring';

async function latestThreadId() {
  // The official monthly thread is posted by the `whoishiring` account and
  // titled "Ask HN: Who is hiring? (<Month Year>)". Search returns decoys
  // (e.g. "...freelance developers?"), so filter to the real one and take the
  // most recent (results are already date-sorted).
  const res = await httpJson(
    'https://hn.algolia.com/api/v1/search_by_date?query=%22Ask%20HN%3A%20Who%20is%20hiring%3F%22&tags=story&hitsPerPage=20',
  );
  const hit = (res.hits || []).find(
    h => h.author === 'whoishiring' && /who is hiring\?\s*\(/i.test(h.title || ''),
  );
  return hit ? hit.objectID : null;
}

export async function fetch(cfg) {
  const id = await latestThreadId();
  if (!id) return [];
  const keywords = (cfg.keywords || []).map(k => k.toLowerCase());
  const thread = await httpJson(`https://hn.algolia.com/api/v1/items/${id}`);
  const comments = (thread.children || []).filter(c => c && c.text && !c.deleted);
  const permalink = id2 => `https://news.ycombinator.com/item?id=${id2}`;
  const out = [];
  for (const c of comments) {
    const text = stripHtml(c.text);
    if (keywords.length && !keywords.some(k => text.toLowerCase().includes(k))) continue;

    // Top-level posts conventionally lead with "Company | Role | Location | …".
    const firstLine = text.split('\n')[0].trim();
    const segs = firstLine.split('|').map(s => s.trim()).filter(Boolean);
    const company = (segs[0] || '').slice(0, 80);
    const role = (segs[1] || segs[0] || firstLine).slice(0, 140);

    // Prefer a real external apply/link from the comment's hrefs; skip HN's own
    // links and any malformed href. Fall back to the comment permalink.
    let url = '';
    const hrefs = [...c.text.matchAll(/href="([^"]+)"/gi)].map(m => m[1]);
    for (const h of hrefs) {
      const clean = h.replace(/&#x2F;/gi, '/').replace(/&amp;/gi, '&');
      if (/^https?:\/\/[^\s"']+\.[^\s"']/.test(clean) && !/ycombinator\.com/.test(clean)) {
        url = clean;
        break;
      }
    }
    if (!url) url = permalink(c.id);

    out.push(
      normalizeJob(
        {
          title: role,
          company,
          location: /\bremote\b/i.test(text) ? 'Remote' : segs[2] || '',
          url,
          remote: /\bremote\b/i.test(text) || undefined,
          description: text.slice(0, 2000),
          postedAt: c.created_at || null,
        },
        'hn-whoishiring',
      ),
    );
  }
  return out;
}
