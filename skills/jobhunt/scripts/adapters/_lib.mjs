// _lib.mjs — shared helpers for jobhunt source adapters.
//
// Every adapter imports from here so the individual adapters stay tiny. Nothing
// here is site-specific. No external dependencies — uses Node's global fetch
// (Node 18+) and a small dependency-free HTML parser / CSS-selector subset for
// the `html` adapter.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) jobsmith-jobhunt/1.0';

// ── HTTP ─────────────────────────────────────────────────────────────────────

export async function httpGet(url, { headers = {}, timeoutMs = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: '*/*', ...headers },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function httpJson(url, opts = {}) {
  const text = await httpGet(url, {
    ...opts,
    headers: { accept: 'application/json', ...(opts.headers || {}) },
  });
  return JSON.parse(text);
}

// ── text utilities ───────────────────────────────────────────────────────────

export function stripHtml(html) {
  if (!html) return '';
  const decode = s =>
    s
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
  const stripTags = s =>
    s
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  // Two passes so entity-encoded markup (e.g. Greenhouse's &lt;div&gt;) is also
  // removed: strip real tags, decode entities (may expose more tags), strip again.
  let out = stripTags(String(html));
  out = decode(out);
  out = stripTags(out);
  return out.replace(/\s+/g, ' ').trim();
}

// Strip tracking params + fragments so the same posting yields one canonical URL.
export function canonicalUrl(raw) {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const drop = [/^utm_/i, /^gh_/i, /^ref$/i, /^source$/i, /^src$/i, /^lever-/i];
    for (const key of [...u.searchParams.keys()]) {
      if (drop.some(rx => rx.test(key))) u.searchParams.delete(key);
    }
    u.hash = '';
    // Normalize trailing slash on the path (but keep root "/").
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch {
    return String(raw).trim();
  }
}

// Best-effort remote detection from a location/title/description blob.
export function looksRemote(...parts) {
  const blob = parts.filter(Boolean).join(' ').toLowerCase();
  return /\bremote\b|\bwork from home\b|\bwfh\b|\bdistributed\b|\banywhere\b/.test(blob);
}

// Normalize a raw adapter hit into the shape the runner + rest of the pipeline
// expect. Missing fields degrade gracefully rather than throwing.
export function normalizeJob(raw, sourceName) {
  const url = canonicalUrl(raw.url || raw.link || '');
  const title = (raw.title || '').toString().trim();
  const company = (raw.company || '').toString().trim();
  const location = (raw.location || '').toString().trim();
  const description = stripHtml(raw.description || raw.contents || raw.body || '');
  return {
    title,
    company,
    location,
    url,
    source: sourceName,
    remote:
      typeof raw.remote === 'boolean'
        ? raw.remote
        : looksRemote(location, title, description),
    postedAt: raw.postedAt || raw.pubDate || raw.updated_at || raw.createdAt || null,
    description: description.slice(0, 4000),
  };
}

// ── minimal RSS / Atom parsing (no deps) ─────────────────────────────────────

function firstTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

export function parseFeed(xml) {
  const items = [];
  const blocks =
    xml.match(/<item[\s\S]*?<\/item>/gi) ||
    xml.match(/<entry[\s\S]*?<\/entry>/gi) ||
    [];
  for (const block of blocks) {
    let link = firstTag(block, 'link');
    if (!link) {
      // Atom uses <link href="..."/>
      const m = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (m) link = m[1];
    }
    items.push({
      title: stripHtml(firstTag(block, 'title')),
      link,
      description: firstTag(block, 'description') || firstTag(block, 'summary') || firstTag(block, 'content'),
      pubDate: firstTag(block, 'pubDate') || firstTag(block, 'updated') || firstTag(block, 'published') || null,
    });
  }
  return items;
}

// ── tiny HTML parser + CSS-selector subset (for the `html` adapter) ──────────
//
// Supports: tag, .class, #id, compound (tag.class#id), and descendant chains
// ("ul.jobs li a"). Enough for regular job-listing markup; for irregular sites
// use the `webfetch` adapter (AI extraction) instead.

function parseNodes(html) {
  // Produce a flat list of open/close/text tokens, then build a light tree.
  const tokens = [];
  const rx = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let last = 0;
  let m;
  const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  while ((m = rx.exec(html))) {
    if (m.index > last) {
      const text = html.slice(last, m.index);
      if (text.trim()) tokens.push({ type: 'text', text });
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = m[4] === '/' || voidTags.has(tag);
    if (closing) tokens.push({ type: 'close', tag });
    else {
      const attrs = {};
      const arx = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|(\S+))/g;
      let a;
      while ((a = arx.exec(m[3]))) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? a[5] ?? '';
      tokens.push({ type: 'open', tag, attrs, selfClose });
      if (selfClose) tokens.push({ type: 'close', tag });
    }
    last = rx.lastIndex;
  }
  // Build tree.
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  const skip = new Set(['script', 'style']);
  let skipping = null;
  for (const t of tokens) {
    if (skipping) {
      if (t.type === 'close' && t.tag === skipping) skipping = null;
      continue;
    }
    if (t.type === 'open') {
      if (skip.has(t.tag)) { skipping = t.tag; continue; }
      const node = { tag: t.tag, attrs: t.attrs, children: [], parent: cur };
      cur.children.push(node);
      if (!t.selfClose) cur = node;
    } else if (t.type === 'close') {
      // Walk up to the matching open tag if the markup is well-formed enough.
      let n = cur;
      while (n && n !== root && n.tag !== t.tag) n = n.parent;
      if (n && n !== root) cur = n.parent;
    } else if (t.type === 'text') {
      cur.children.push({ tag: '#text', text: t.text, children: [], parent: cur });
    }
  }
  return root;
}

function matchSimple(node, sel) {
  if (node.tag === '#text' || node.tag === '#root') return false;
  const m = sel.match(/^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/);
  if (!m) return false;
  const [, tag, rest] = m;
  if (tag && node.tag !== tag.toLowerCase()) return false;
  const classes = (node.attrs.class || '').split(/\s+/);
  const parts = rest.match(/[.#][\w-]+/g) || [];
  for (const p of parts) {
    if (p[0] === '.' && !classes.includes(p.slice(1))) return false;
    if (p[0] === '#' && node.attrs.id !== p.slice(1)) return false;
  }
  return true;
}

function descendants(node, out = []) {
  for (const c of node.children) {
    if (c.tag !== '#text') { out.push(c); descendants(c, out); }
  }
  return out;
}

export function select(root, selector) {
  // Descendant combinator chain: match each step against the survivors so far.
  const steps = selector.trim().split(/\s+/);
  let matches = [root];
  for (const step of steps) {
    const next = [];
    for (const ctx of matches) {
      for (const d of descendants(ctx)) if (matchSimple(d, step)) next.push(d);
    }
    matches = next;
  }
  return matches;
}

export function nodeText(node) {
  if (node.tag === '#text') return node.text;
  return node.children.map(nodeText).join('');
}

export function parseHtml(html) {
  return parseNodes(html);
}
