#!/usr/bin/env node
/**
 * File today's edition into the archive.
 *
 *   node scripts/edition.mjs
 *
 * Every refresh, this reduces the current snapshot to an edition and writes it
 * to editions/<YYYY-MM-DD>.json — one file per UTC day, last write of the day
 * wins. It also maintains editions/index.json, which lists the dates and
 * carries a one-line digest of each so long-range trends survive pruning.
 *
 * Why an archive at all: a newspaper you read every day should say what changed
 * since yesterday. Without history every load looks identical and reviewing
 * means diffing the page in your head.
 *
 * Two tiers on purpose:
 *
 *   editions/<date>.json   rich enough to re-set the whole front page.
 *                          ~12KB each, PRUNED to KEEP_DAYS.
 *   editions/index.json    dates plus a ~100-byte digest per day. Kept
 *                          forever; 90 days of it is under 10KB.
 *
 * Storing full snapshots instead would cost roughly 7MB a quarter and grow
 * without limit, for data nobody reads at that fidelity.
 *
 * Editions carry NO timestamps that move on their own — no generatedAt. A
 * refresh that finds nothing new must produce a byte-identical edition, or the
 * workflow's "don't commit if nothing changed" check stops working, exactly as
 * it did in repo-radar. The date is the identity; that's enough.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "editions");

/** How many rich editions to retain. index.json digests outlive them.
 *  Measured at ~12KB each for 12 repos, so a quarter's worth is about 1MB. */
export const KEEP_DAYS = 90;

/**
 * Strip a snapshot down to an edition: everything the front page needs to set
 * itself, minus the bulk nobody reads in a back issue.
 *
 * Dropped: the 365-day heatmap (~15KB), the per-repo daily series, and all but
 * the most recent commit of each repo (~22KB). A back issue shows the weather
 * box hidden and one "most recently" line per story, which is what you actually
 * want from "where was I on Friday".
 */
/**
 * The two figures the Forecast rests on, plus the queue length.
 *
 * Stored so the *next* day's Corrections column can mark the forecast against
 * what actually happened. A prediction nobody checks is decoration.
 *
 * Deliberately arithmetic only — no trend label, no prose. The rule that turns
 * these numbers into a claim lives in `trendOf()` in the page, and a second
 * copy here would be one judgement in two places, drifting apart. The page
 * re-derives the claim from these figures when it marks them.
 *
 * Derived from `daily`, a rolling 30-day window, so it shifts once per UTC day
 * rather than on every refresh — which is the byte stability the no-op commit
 * check depends on.
 */
function forecastFacts(snap) {
  const series = (snap.repos || [])
    .map((r) => r.daily)
    .filter((x) => Array.isArray(x) && x.length >= 14);
  if (!series.length) return null;
  const sum = (from, to) =>
    series.reduce((n, s) => n + s.slice(from, to).reduce((a, b) => a + b, 0), 0);
  return { week: sum(-7, undefined), before: sum(-14, -7), queue: (snap.attention || []).length };
}

export function toEdition(snap) {
  return {
    date: String(snap.generatedAt).slice(0, 10),
    user: snap.user,
    scope: snap.scope,
    summary: snap.summary,
    forecast: forecastFacts(snap),
    repos: (snap.repos || []).map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description ?? null,
      language: r.language ?? null,
      defaultBranch: r.defaultBranch ?? null,
      status: r.status,
      pinned: !!r.pinned,
      lastActivityAt: r.lastActivityAt,
      counts: r.counts,
      latestCommit: r.commits?.[0]
        ? { message: r.commits[0].message, date: r.commits[0].date, url: r.commits[0].url }
        : null,
      openPRs: (r.openPRs || []).map((p) => ({
        number: p.number, title: p.title, url: p.url,
        isDraft: !!p.isDraft, createdAt: p.createdAt, updatedAt: p.updatedAt,
      })),
      openIssues: (r.openIssues || []).map((i) => ({
        number: i.number, title: i.title, url: i.url,
        createdAt: i.createdAt, updatedAt: i.updatedAt, assigned: !!i.assigned,
      })),
      branches: (r.branches || []).map((b) => ({
        name: b.name, lastCommit: b.lastCommit, unmergedCommits: b.unmergedCommits,
      })),
    })),
    tasks: snap.tasks || [],
    attention: snap.attention || [],
  };
}

/** The ~100-byte line kept forever, so trends outlive the pruned editions. */
export function toDigest(edition) {
  const s = edition.summary || {};
  return {
    repos: s.repos ?? 0,
    activeRepos: s.activeRepos ?? 0,
    commits7d: s.commits7d ?? 0,
    openPRs: s.openPRs ?? 0,
    openIssues: s.openIssues ?? 0,
    needsAttention: s.needsAttention ?? 0,
  };
}

/**
 * Guard: an edition must not carry anything that moves on its own, or every
 * refresh writes a different file and the no-op commit check dies.
 */
export function assertEdition(ed) {
  const fail = (m) => { throw new Error(`edition invariant violated: ${m}`); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ed.date)) fail(`date "${ed.date}" malformed`);
  if (ed.scope !== "public") fail(`scope is "${ed.scope}", expected "public"`);
  if (ed.generatedAt !== undefined) fail("editions must not carry generatedAt");
  for (const r of ed.repos) {
    if (r.isPrivate) fail(`repo "${r.name}" is marked private`);
    for (const k of ["ageInDays", "idleDays", "daysSinceLastPush"]) {
      if (Object.hasOwn(r, k)) fail(`repo "${r.name}" carries clock-derived "${k}"`);
    }
  }
}

function main() {
  const snap = JSON.parse(readFileSync(join(ROOT, "data/snapshot.json"), "utf8"));
  const edition = toEdition(snap);
  assertEdition(edition);

  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${edition.date}.json`), JSON.stringify(edition) + "\n");

  // Rebuild the index from what's on disk, so a hand-deleted file self-heals.
  let index = { dates: [], digest: {} };
  try {
    index = JSON.parse(readFileSync(join(DIR, "index.json"), "utf8"));
  } catch { /* first run */ }
  index.digest = index.digest || {};
  index.digest[edition.date] = toDigest(edition);

  const onDisk = readdirSync(DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.slice(0, 10))
    .sort()
    .reverse();

  // Prune the rich editions; keep every digest.
  const pruned = onDisk.slice(KEEP_DAYS);
  for (const d of pruned) rmSync(join(DIR, `${d}.json`));

  index.dates = onDisk.slice(0, KEEP_DAYS);
  // Digest keys stay sorted newest-first so the file diffs cleanly.
  const allDates = Object.keys(index.digest).sort().reverse();
  index.digest = Object.fromEntries(allDates.map((d) => [d, index.digest[d]]));

  writeFileSync(join(DIR, "index.json"), JSON.stringify(index, null, 2) + "\n");

  const bytes = JSON.stringify(edition).length;
  console.log(
    `filed ${edition.date} (${(bytes / 1024).toFixed(1)}KB) · ` +
      `${index.dates.length} editions on disk · ${allDates.length} digests` +
      (pruned.length ? ` · pruned ${pruned.join(", ")}` : ""),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
