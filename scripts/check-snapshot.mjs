#!/usr/bin/env node
/**
 * Check the incoming snapshot against what this paper actually reads.
 *
 *   node scripts/check-snapshot.mjs [path]        # defaults to data/snapshot.json
 *
 * Why this exists
 * ---------------
 * `data/snapshot.json` is produced by a *different repository*. repo-radar
 * collects it, publishes it, and has no idea this site consumes it. Its own
 * tests all pass whatever it does to the file's shape.
 *
 * So a rename over there — `daily` to `dailyCommits`, say — would sail through
 * repo-radar's checks, sail through this repo's fetch, and quietly hollow the
 * page out: no Forecast, no Corrections, every story falling back to its
 * dullest angle, and a green build the whole way. Nobody would notice for days,
 * and when they did they'd be debugging the page rather than the schema.
 *
 * This turns that into a red build on the same refresh, naming the field and
 * the sections that die with it.
 *
 * What it is not
 * --------------
 * Not a schema validator. It doesn't care about extra fields — repo-radar adds
 * those freely and should — and it doesn't care whether values are sensible,
 * only whether the *keys the page reads* are present. Emptiness is legitimate
 * data (no open reviews is a fine Tuesday); absence is a broken contract.
 *
 * That distinction is the whole design: every check is `Object.hasOwn`, never
 * truthiness. A `reviewDecision` of `null` is a review nobody has looked at. A
 * missing `reviewDecision` key means the collector stopped sending it and the
 * Classifieds can no longer tell you what's approved.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = process.argv[2] || join(ROOT, "data/snapshot.json");

/**
 * The contract, with the cost of each field in plain language.
 *
 * The `why` is the point of the whole file. A failure that says
 * "missing repos[].daily" sends you to the schema; one that says the Forecast,
 * Corrections and every story's angle depend on it tells you what the reader
 * lost, which is what you actually need to decide how urgent it is.
 */
const CONTRACT = {
  root: {
    generatedAt: "the dateline, the edition number, the folio and the archive's filename",
    user: "the byline under every article",
    scope: "the masthead's public-only line, and the guard that we never print private work",
    summary: "the lede across the top of the page",
    repos: "every article on the page",
    tasks: "nothing directly today, but the dashboard reads it and editions carry it",
    attention: "Stop Press, the Editorial, the Forecast's queue line and In Tomorrow's Paper",
    heatmap: "The Year in Weather",
  },
  summary: {
    repos: "the masthead count",
    activeRepos: "the lede",
    openPRs: "the lede",
    openIssues: "the lede",
    commits7d: "the lede and the Editorial's quiet-week branch",
    needsAttention: "the lede",
  },
  repo: {
    name: "headlines, engravings, and every hash that keeps the page stable",
    url: "the headline link and the lead's jump line",
    description: "the opening sentence of every story",
    language: "the kicker, the engraving's motif, and the Advertisements",
    defaultBranch: "the branch sentence in the body copy",
    lastActivityAt: "the deck's 'last touched', Gone to Sleep, and In Tomorrow's Paper",
    status: "placement on the page, the status pip, and the engraving's ink weight",
    pinned: "the Pinned marker in the kicker",
    counts: "almost every sentence in the body copy",
    commits: "the pull quote and the 'last word from the workbench' line",
    openPRs: "the Classifieds and the review sentences",
    openIssues: "Letters to the Editor",
    branches: "the branch sentences and the parked-work angle",
    daily: "the Forecast, Corrections & Clarifications, and the streak and surge angles",
  },
  counts: {
    commits7d: "the headline angle and the opening line of every story",
    commits30d: "the breather and milestone angles",
    openPRs: "the deck and the shipping angle",
    openIssues: "the deck",
    branches: "the deck and the parked angle",
  },
  commit: {
    message: "the pull quote and the last-dispatch line",
    date: "the pull quote's attribution",
    url: "nothing yet — kept so a future edition can link a commit",
  },
  pr: {
    number: "the Classifieds heading and the Editorial",
    title: "the Classifieds and the review sentence in the body",
    url: "the Classifieds link",
    isDraft: "the 'coming soon' lead-in",
    createdAt: "nothing yet; editions carry it",
    updatedAt: "how long an ad has been waiting, and the Classifieds ordering",
    reviewDecision: "'Approved — awaiting collection', the ad ordering, and the Editorial's lead",
    additions: "the job size in the Classifieds",
    deletions: "the job size in the Classifieds",
    headRef: "the branch name printed on each ad",
  },
  issue: {
    number: "the Births, Marriages & Deaths entry",
    title: "the letter itself",
    url: "the letter's link",
    createdAt: "how long the letter has been standing",
    updatedAt: "editions and the diff",
    assigned: "whether the letter is signed by the assignee or a correspondent",
  },
  branch: {
    name: "the Births entry and Stop Press",
    lastCommit: "lastActivityAt, which decides placement",
    unmergedCommits: "'two commits already to its name' in Births",
  },
  attentionItem: {
    type: "the Stop Press label",
    repo: "the Editorial, Stop Press and In Tomorrow's Paper",
    title: "all three of the above",
    url: "the Stop Press link",
    createdAt: "editions",
    updatedAt: "every 'waiting N days' on the page, and every threshold crossing",
    stale: "nothing directly; the dashboard uses it",
  },
  heatmapDay: {
    date: "the month labels and the per-cell tooltip",
    count: "the ink level of every cell",
  },
};

const problems = [];
const notes = [];

/**
 * Absence is a broken contract. Emptiness is a quiet Tuesday.
 *
 * `kind` is the *shape* of the path rather than the path itself —
 * `repos[].daily`, not `repos["ai-news-digest"].daily`. One dropped field hits
 * every repo, and printing the identical line thirteen times buries whatever
 * else went wrong underneath it. Instances get counted instead.
 */
function require_(obj, shape, kind) {
  for (const [key, why] of Object.entries(shape)) {
    if (!obj || !Object.hasOwn(obj, key)) {
      const at = `${kind}.${key}`;
      const seen = problems.find((p) => p.at === at);
      if (seen) seen.count++;
      else problems.push({ at, why, count: 1 });
    }
  }
}

/** Problems that aren't about a missing field. */
const flag = (message) => problems.push({ at: null, why: message, count: 1 });

/** Everything the contract asserts, against an already-parsed snapshot. */
function check(snap) {
  require_(snap, CONTRACT.root, "snapshot");
  require_(snap.summary, CONTRACT.summary, "snapshot.summary");

  // Invariants the page assumes rather than merely reads.
  if (snap.scope !== "public") {
    flag(`snapshot.scope is "${snap.scope}", not "public" — this site is world-readable and must never print anything else`);
  }
  if (snap.sample) flag("snapshot is flagged as sample data");
  if (!Array.isArray(snap.repos)) {
    flag("snapshot.repos is not an array — there is no page without it");
  }

  const repos = Array.isArray(snap.repos) ? snap.repos : [];
  const priv = repos.filter((r) => r.isPrivate);
  if (priv.length) flag(`private repos present: ${priv.map((r) => r.name).join(", ")}`);

  if (!repos.length) {
    // Legitimate — an account with nothing public — but say so, because a
    // silent pass here would mean none of the per-repo contract was checked.
    notes.push("no repos in the snapshot, so the per-repo shape went unchecked");
  }

  for (const r of repos) {
    const at = `repos[${JSON.stringify(r.name ?? "?")}]`;
    require_(r, CONTRACT.repo, "repos[]");
    require_(r.counts, CONTRACT.counts, "repos[].counts");

    // The forecast needs a fortnight; the sparkline logic assumes thirty.
    if (Array.isArray(r.daily) && r.daily.length < 14) {
      flag(`${at}.daily has ${r.daily.length} days — the Forecast and Corrections need at least 14`);
    }
    // Check one of each nested kind. Checking all of them would print the same
    // failure a hundred times over for one schema change.
    if (r.commits?.[0]) require_(r.commits[0], CONTRACT.commit, "repos[].commits[]");
    if (r.openPRs?.[0]) require_(r.openPRs[0], CONTRACT.pr, "repos[].openPRs[]");
    if (r.openIssues?.[0]) require_(r.openIssues[0], CONTRACT.issue, "repos[].openIssues[]");
    if (r.branches?.[0]) require_(r.branches[0], CONTRACT.branch, "repos[].branches[]");
  }

  if (Array.isArray(snap.attention) && snap.attention[0]) {
    require_(snap.attention[0], CONTRACT.attentionItem, "attention[]");
  }
  if (Array.isArray(snap.heatmap)) {
    if (!snap.heatmap.length) notes.push("the heatmap is empty — The Year in Weather will not print");
    else require_(snap.heatmap[0], CONTRACT.heatmapDay, "heatmap[]");
  }

  // Nested kinds that exist nowhere in today's data are unchecked, and saying
  // so is the difference between "verified" and "found nothing to verify".
  const seen = {
    commits: repos.some((r) => r.commits?.length),
    "open reviews": repos.some((r) => r.openPRs?.length),
    "open issues": repos.some((r) => r.openIssues?.length),
    branches: repos.some((r) => r.branches?.length),
  };
  const unseen = Object.entries(seen).filter(([, ok]) => !ok).map(([k]) => k);
  if (unseen.length) notes.push(`nothing to check the shape of: ${unseen.join(", ")}`);
  return repos;
}

function main() {
  let snap;
  try {
    snap = JSON.parse(readFileSync(FILE, "utf8"));
  } catch (e) {
    console.error(`cannot read ${FILE}: ${e.message}`);
    process.exit(1);
  }
  const repos = check(snap);

  for (const n of notes) console.log(`note: ${n}`);

  if (problems.length) {
    console.error(`\nThe snapshot no longer matches what this paper reads (${problems.length}):\n`);
    for (const p of problems) {
      const where = p.at ? `${p.at} is missing${p.count > 1 ? ` (${p.count} repos)` : ""} — it feeds ` : "";
      console.error(`  ✗ ${where}${p.why}`);
    }
    console.error(`
This file comes from repo-radar, whose own tests pass whatever it does to the
shape. Either restore the field there, or update this contract and the page
together — but don't just delete the check, because a section that silently
stops printing is exactly what it exists to catch.`);
    process.exit(1);
  }

  const fields = Object.values(CONTRACT).reduce((n, o) => n + Object.keys(o).length, 0);
  console.log(`snapshot contract holds — ${fields} fields across ${repos.length} repos`);
}

/**
 * Check the checker.
 *
 *   node scripts/check-snapshot.mjs --selftest
 *
 * This one runs unattended on every refresh, which is exactly the kind of
 * guard that can quietly degenerate into always passing — and then you have no
 * protection and no idea. So: break a known-good snapshot in each way that
 * matters and require the checker to notice.
 *
 * It also covers the cases the live data can't. Today's snapshot has no open
 * reviews at all, so the pull-request half of the contract would otherwise go
 * unexercised for however many weeks it takes one to appear.
 */
function selftest() {
  const good = {
    generatedAt: "2026-08-13T00:00:00Z", user: "someone", scope: "public",
    summary: { repos: 1, activeRepos: 1, openPRs: 1, openIssues: 1, commits7d: 1, needsAttention: 1 },
    tasks: [], heatmap: [{ date: "2026-08-13", count: 1 }],
    attention: [{ type: "branch", repo: "a", title: "t", url: "#", createdAt: "x", updatedAt: "x", stale: true }],
    repos: [{
      name: "a", url: "#", description: null, language: "Python", defaultBranch: "main",
      lastActivityAt: "2026-08-13T00:00:00Z", status: "hot", pinned: false,
      counts: { commits7d: 1, commits30d: 1, openPRs: 1, openIssues: 1, branches: 1 },
      daily: new Array(30).fill(0),
      commits: [{ message: "m", date: "2026-08-13T00:00:00Z", url: "#" }],
      openPRs: [{ number: 1, title: "t", url: "#", isDraft: false, createdAt: "x", updatedAt: "x",
                  reviewDecision: null, additions: 1, deletions: 0, headRef: "b" }],
      openIssues: [{ number: 1, title: "t", url: "#", createdAt: "x", updatedAt: "x", assigned: false }],
      branches: [{ name: "b", lastCommit: "2026-08-13T00:00:00Z", unmergedCommits: 1 }],
    }],
  };

  const clone = () => JSON.parse(JSON.stringify(good));
  const cases = [
    ["a clean snapshot passes", (s) => s, 0],
    ["a dropped root field", (s) => { delete s.heatmap; return s; }, 1],
    ["a dropped summary field", (s) => { delete s.summary.commits7d; return s; }, 1],
    ["a dropped repo field", (s) => { delete s.repos[0].daily; return s; }, 1],
    ["a dropped counts field", (s) => { delete s.repos[0].counts.commits30d; return s; }, 1],
    ["a dropped commit field", (s) => { delete s.repos[0].commits[0].date; return s; }, 1],
    ["a dropped review field", (s) => { delete s.repos[0].openPRs[0].reviewDecision; return s; }, 1],
    ["a dropped diff size", (s) => { delete s.repos[0].openPRs[0].additions; return s; }, 1],
    ["a dropped issue field", (s) => { delete s.repos[0].openIssues[0].assigned; return s; }, 1],
    ["a dropped branch field", (s) => { delete s.repos[0].branches[0].unmergedCommits; return s; }, 1],
    ["a dropped attention field", (s) => { delete s.attention[0].updatedAt; return s; }, 1],
    ["a dropped heatmap field", (s) => { delete s.heatmap[0].count; return s; }, 1],
    ["a renamed field (the real failure mode)", (s) => {
      s.repos[0].dailyCommits = s.repos[0].daily; delete s.repos[0].daily; return s; }, 1],
    ["a private repo", (s) => { s.repos[0].isPrivate = true; return s; }, 1],
    ["a non-public scope", (s) => { s.scope = "all"; return s; }, 1],
    ["sample data", (s) => { s.sample = true; return s; }, 1],
    ["too short a daily series", (s) => { s.repos[0].daily = [1, 2, 3]; return s; }, 1],
    // Emptiness is legitimate data and must NOT fail.
    ["no open reviews", (s) => { s.repos[0].openPRs = []; return s; }, 0],
    ["no repos at all", (s) => { s.repos = []; return s; }, 0],
    ["a null description", (s) => { s.repos[0].description = null; return s; }, 0],
    ["an unreviewed review", (s) => { s.repos[0].openPRs[0].reviewDecision = null; return s; }, 0],
    ["extra fields the paper doesn't read", (s) => { s.repos[0].stars = 5; s.newThing = true; return s; }, 0],
  ];

  let failed = 0;
  for (const [name, mangle, wantProblems] of cases) {
    problems.length = 0; notes.length = 0;
    const snap = mangle(clone());
    // Re-run the body of main() against an in-memory snapshot.
    check(snap);
    const got = problems.length;
    const ok = wantProblems === 0 ? got === 0 : got > 0;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${got} problems, wanted ${wantProblems ? "at least one" : "none"}`}`);
  }
  problems.length = 0;
  console.log(failed ? `\n${failed} selftest failures` : `\nall ${cases.length} selftests passed`);
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();
else main();
