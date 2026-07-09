#!/usr/bin/env node
// digest-server.mjs — the job-hunt "Morning Digest" server.
//
//   node digest-server.mjs <jobs.json path> [--config <jobhunt.config.json>] [--port N]
//
// Serves the interactive digest UI (digest.html, beside this file) and persists
// cart / dismiss / watched / search-term / rubric edits back into jobs.json and
// the workspace config. Dependency-free (Node stdlib only).
//
// Paths are passed in (not derived from this script's location) so the plugin
// script stays generic while the DATA lives in the user's workspace:
//   - <jobs.json path>      the data store (required, positional)
//   - --config <path>       the workspace jobhunt.config.json that search-term /
//                           weight / watched edits write back to. Defaults to
//                           <jobsDir>/../jobhunt.config.json.
//   - --port N              overrides config.serverPort (default 8124).
//
// The UI (digest.html) reads GET /api/state and categorizes jobs by score vs the
// configured bar (and `near`), so it renders whatever the latest hunt wrote.

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(__dirname, "digest.html");   // the UI ships with the plugin

// ── args ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const positional = [];
let argConfig = null, argPort = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--config") argConfig = argv[++i];
  else if (argv[i] === "--port") argPort = Number(argv[++i]);
  else positional.push(argv[i]);
}
const JOBS = positional[0] ? path.resolve(positional[0]) : null;
if (!JOBS) {
  console.error("usage: node digest-server.mjs <jobs.json path> [--config <jobhunt.config.json>] [--port N]");
  process.exit(2);
}
const CONFIG = argConfig
  ? path.resolve(argConfig)
  : path.join(path.dirname(JOBS), "..", "jobhunt.config.json");

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } }
function writeJsonAtomic(p, obj) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

// Editable search-term groups. Each maps a UI group to the exact spot in the
// config that fetch-jobs.mjs reads, so edits here change the NEXT hunt's queries.
const TERM_GROUPS = [
  { group: "indeed",         label: "Indeed (MCP)",         kind: "queries",  field: "queries",       get: c => (c.mcpSources || []).find(s => s.type === "indeed") },
  { group: "hn-whoishiring", label: "HN “Who is hiring?”",  kind: "keywords", field: "keywords",      get: c => (c.sources || []).find(s => s.type === "hn-whoishiring") },
  { group: "remoteok",       label: "RemoteOK",             kind: "tags",     field: "tags",          get: c => (c.sources || []).find(s => s.type === "remoteok") },
  { group: "searchQueries",  label: "Open-web search",      kind: "queries",  field: "searchQueries", get: c => c },
];

function buildSearchTerms(cfg) {
  return TERM_GROUPS.map(g => {
    const cont = g.get(cfg);
    const terms = cont && Array.isArray(cont[g.field]) ? cont[g.field] : [];
    const out = { group: g.group, label: g.label, kind: g.kind, terms, present: !!cont };
    if (g.group === "indeed" && cont) { out.location = cont.location || ""; out.enabled = cont.enabled !== false; }
    if (g.group === "searchQueries") { out.enabled = terms.length > 0; }
    return out;
  });
}

// Lean job payload for the client — drop the big description, keep a snippet.
function slimJob(j) {
  return {
    id: j.id, title: j.title, company: j.company, location: j.location || "",
    url: j.url, source: j.source, remote: !!j.remote, watched: !!j.watched,
    score: j.score, breakdown: j.breakdown || null, rationale: j.rationale || "",
    decision: j.decision, status: j.status, cart: !!j.cart, dismissed: !!j.dismissed,
    snippet: (j.description || "").replace(/\s+/g, " ").slice(0, 260),
    postedAt: j.postedAt || null,
  };
}

function buildState() {
  const cfg = readJson(CONFIG, {});
  const jobs = readJson(JOBS, []);
  const factors = (cfg.rubric && cfg.rubric.factors) || [];
  return {
    config: {
      bar: cfg.bar ?? 80,
      nearWindow: cfg.nearWindow ?? 10,
      weights: factors.map(f => ({ key: f.key, label: f.label, weight: f.weight, guidance: f.guidance })),
      watchedCompanies: cfg.watchedCompanies || [],
      watchedScoreBump: cfg.watchedScoreBump ?? 0,
      comp: cfg.comp || null,
      locationPref: cfg.locationPref || { relocationTolerance: 0 },
    },
    jobs: jobs.map(slimJob),
    searchTerms: buildSearchTerms(cfg),
    generatedAt: null,
  };
}

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let s = ""; req.on("data", d => (s += d)); req.on("end", () => { try { resolve(JSON.parse(s || "{}")); } catch { resolve({}); } });
  });
}

// Mutations on a single job
function patchJob(id, fn) {
  const jobs = readJson(JOBS, []);
  const j = jobs.find(x => x.id === id);
  if (!j) return { ok: false };
  fn(j);
  writeJsonAtomic(JOBS, jobs);
  return { ok: true, job: slimJob(j) };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const p = url.pathname;
  try {
    if (req.method === "GET" && (p === "/" || p === "/index.html")) {
      return send(res, 200, fs.readFileSync(INDEX, "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && p === "/api/state") {
      return send(res, 200, buildState());
    }
    if (req.method === "GET" && p.startsWith("/api/job/")) {
      const id = p.split("/")[3];
      const jobs = readJson(JOBS, []);
      const j = jobs.find(x => x.id === id);
      return j ? send(res, 200, { id: j.id, description: j.description || "", breakdown: j.breakdown, rationale: j.rationale })
               : send(res, 404, { error: "not found" });
    }
    if (req.method === "POST" && p === "/api/cart") {
      const { id, on } = await readBody(req);
      const r = patchJob(id, j => { j.cart = !!on; });
      return send(res, r.ok ? 200 : 404, r);
    }
    if (req.method === "POST" && p === "/api/dismiss") {
      const { id, on } = await readBody(req);
      const r = patchJob(id, j => { j.dismissed = !!on; });
      return send(res, r.ok ? 200 : 404, r);
    }
    if (req.method === "POST" && p === "/api/watched") {
      const { company, action } = await readBody(req);
      const cfg = readJson(CONFIG, {});
      cfg.watchedCompanies = cfg.watchedCompanies || [];
      const name = (company || "").trim();
      if (!name) return send(res, 400, { error: "empty company" });
      const lc = name.toLowerCase();
      const has = cfg.watchedCompanies.some(w => w.toLowerCase() === lc);
      if (action === "remove") cfg.watchedCompanies = cfg.watchedCompanies.filter(w => w.toLowerCase() !== lc);
      else if (!has) cfg.watchedCompanies.push(name);
      writeJsonAtomic(CONFIG, cfg);
      // reflect watched flag on existing jobs immediately
      const jobs = readJson(JOBS, []);
      const set = cfg.watchedCompanies.map(w => w.toLowerCase());
      for (const j of jobs) j.watched = set.some(w => (j.company || "").toLowerCase().includes(w));
      writeJsonAtomic(JOBS, jobs);
      return send(res, 200, { ok: true, watchedCompanies: cfg.watchedCompanies });
    }
    if (req.method === "POST" && p === "/api/search-terms") {
      const { group, action, term, location } = await readBody(req);
      const g = TERM_GROUPS.find(x => x.group === group);
      if (!g) return send(res, 400, { error: "unknown group" });
      const cfg = readJson(CONFIG, {});
      const cont = g.get(cfg);
      if (!cont) return send(res, 400, { error: `source '${group}' is not in the config` });
      if (!Array.isArray(cont[g.field])) cont[g.field] = [];
      const arr = cont[g.field];
      if (action === "add" && term) {
        const t = String(term).trim();
        if (t && !arr.some(x => x.toLowerCase() === t.toLowerCase())) arr.push(t);
      } else if (action === "remove" && term) {
        cont[g.field] = arr.filter(x => x !== term);
      } else if (group === "indeed" && typeof location === "string") {
        cont.location = location.trim();
      } else {
        return send(res, 400, { error: "no-op: need add/remove term or an indeed location" });
      }
      writeJsonAtomic(CONFIG, cfg);
      return send(res, 200, { ok: true, searchTerms: buildSearchTerms(cfg) });
    }
    if (req.method === "POST" && p === "/api/config") {
      const patch = await readBody(req);
      const cfg = readJson(CONFIG, {});
      if (typeof patch.bar === "number") cfg.bar = patch.bar;
      if (typeof patch.nearWindow === "number") cfg.nearWindow = patch.nearWindow;
      if (typeof patch.watchedScoreBump === "number") cfg.watchedScoreBump = patch.watchedScoreBump;
      if (patch.weights && Array.isArray(patch.weights) && cfg.rubric && cfg.rubric.factors) {
        for (const w of patch.weights) {
          const f = cfg.rubric.factors.find(f => f.key === w.key);
          if (f && typeof w.weight === "number") f.weight = w.weight;
        }
      }
      if (patch.comp) cfg.comp = Object.assign({}, cfg.comp, patch.comp);
      if (patch.locationPref) cfg.locationPref = Object.assign({}, cfg.locationPref, patch.locationPref);
      writeJsonAtomic(CONFIG, cfg);
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: String(e && e.message || e) });
  }
});

const PORT = argPort || (readJson(CONFIG, {}).serverPort) || 8124;
server.listen(PORT, () => console.log(`[digest] serving http://localhost:${PORT}  (jobs: ${JOBS})`));
