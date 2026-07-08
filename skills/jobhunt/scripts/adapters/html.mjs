// html.mjs — generic HTML-scrape adapter for pages without an API or feed.
//
// Config:
//   {
//     "type": "html",
//     "url": "https://devquest.gg/jobs",
//     "item": "ul.jobs li",       // CSS selector for each job block (required)
//     "title": "a.title",          // selector within the block (optional)
//     "link": "a.title",           // selector whose href is the JD url (optional)
//     "company": ".company",       // optional
//     "location": ".location",     // optional
//     "companyName": "DevQuest",   // constant fallback if no per-row company
//     "baseUrl": "https://devquest.gg"  // to resolve relative hrefs (optional)
//   }
//
// Supports a small CSS subset (tag, .class, #id, descendant chains). For sites
// with irregular markup, prefer the `webfetch` adapter (AI extraction).

import { httpGet, parseHtml, select, nodeText, normalizeJob } from './_lib.mjs';

export const type = 'html';

function textOf(block, sel) {
  if (!sel) return '';
  const n = select(block, sel)[0];
  return n ? nodeText(n).replace(/\s+/g, ' ').trim() : '';
}

function hrefOf(block, sel, baseUrl) {
  const n = sel ? select(block, sel)[0] : (select(block, 'a')[0] || null);
  if (!n) return '';
  const href = n.attrs?.href || '';
  if (!href) return '';
  try {
    return baseUrl ? new URL(href, baseUrl).toString() : href;
  } catch {
    return href;
  }
}

export async function fetch(cfg) {
  if (!cfg.url) throw new Error('html adapter needs a "url"');
  if (!cfg.item) throw new Error('html adapter needs an "item" selector');
  const html = await httpGet(cfg.url);
  const root = parseHtml(html);
  const base = cfg.baseUrl || new URL(cfg.url).origin;
  const label = cfg.label || cfg.companyName || new URL(cfg.url).hostname;
  const blocks = select(root, cfg.item);
  return blocks
    .map(block =>
      normalizeJob(
        {
          title: textOf(block, cfg.title) || nodeText(block).replace(/\s+/g, ' ').trim().slice(0, 140),
          company: textOf(block, cfg.company) || cfg.companyName || '',
          location: textOf(block, cfg.location),
          url: hrefOf(block, cfg.link, base),
          description: '',
        },
        `html:${label}`,
      ),
    )
    .filter(j => j.url && j.title);
}
