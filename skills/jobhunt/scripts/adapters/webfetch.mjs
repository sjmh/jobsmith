// webfetch.mjs — the "just give me a URL" catch-all adapter.
//
// Config: { "type": "webfetch", "url": "https://devquest.gg/jobs" }
//
// Unlike the other adapters, this one cannot turn a page into structured jobs on
// its own — irregular sites need judgement. It fetches the page and returns the
// cleaned text under `requiresLLM`, and the runner routes it to a
// `pendingExtraction` list. The jobhunt SKILL then uses its WebFetch tool + an AI
// pass to extract the postings into the normalized shape. This is what makes
// adding a brand-new site as easy as dropping in one config line.

import { httpGet, stripHtml } from './_lib.mjs';

export const type = 'webfetch';
export const requiresLLM = true;

export async function fetch(cfg) {
  if (!cfg.url) throw new Error('webfetch adapter needs a "url"');
  let pageText = '';
  try {
    pageText = stripHtml(await httpGet(cfg.url)).slice(0, 12000);
  } catch (e) {
    // Even if the pre-fetch fails, hand the URL to the skill — its WebFetch tool
    // may succeed where a raw request was blocked.
    pageText = '';
  }
  return {
    requiresLLM: true,
    url: cfg.url,
    hint: cfg.hint || 'Extract each job posting: title, company, location, apply URL.',
    pageText,
  };
}
