#!/usr/bin/env node
/**
 * Render the paper in every state and shape that has broken before, and fail
 * loudly if any of them regress.
 *
 *   python3 -m http.server 8000 &
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/render-check.mjs [http://localhost:8000]
 *
 * Set CHROMIUM_PATH to point at a browser you already have instead of letting
 * Playwright download one.
 *
 * Playwright is a dev-only dependency, deliberately not committed to a
 * package.json: the published site still has no dependencies and no build
 * step, and this script never runs as part of it. Same arrangement as
 * repo-radar's validate-queries.mjs, and for the same reason.
 *
 * What it guards, all of which has actually gone wrong at least once:
 *
 *   - a section throwing on a snapshot shape it didn't expect (back issues
 *     carry latestCommit, not commits, and that took the whole page down);
 *   - NaN, undefined or "Invalid Date" reaching the page;
 *   - horizontal overflow, which is invisible at 1250px and ruins 390px and
 *     the printed page (the year-in-weather grid ran 218px off A4);
 *   - the pull quote setting something that isn't worth setting;
 *   - engravings shifting between renders, which would make the paper a
 *     different paper on every load.
 *
 * It writes a temporary snapshot into data/ and restores it on the way out,
 * including after a failure. Don't run it against a working tree you have
 * uncommitted snapshot changes in.
 */
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SNAP = join(ROOT, "data/snapshot.json");
const BAK = join(tmpdir(), "repo-radar-paper-render-check.json");
const BASE = process.argv[2] || "http://localhost:8000";

/** Viewports worth checking, and why each one is on the list. */
const SHAPES = [
  { label: "desktop", viewport: { width: 1250, height: 900 }, colorScheme: "light" },
  { label: "dark", viewport: { width: 1250, height: 900 }, colorScheme: "dark" },
  { label: "mobile", viewport: { width: 390, height: 844 }, colorScheme: "light" },
  // Print is checked at true page widths, because the media query alone
  // doesn't tell you whether the content fits the paper.
  { label: "print-a4", viewport: { width: 794, height: 1123 }, colorScheme: "light", print: true },
  { label: "print-letter", viewport: { width: 816, height: 1056 }, colorScheme: "light", print: true },
  // Everything that moves has to be switched off here. The heatmap tooltip's
  // fade slipped through the first time the rule was written down.
  { label: "reduced-motion", viewport: { width: 1250, height: 900 }, colorScheme: "light", reducedMotion: "reduce" },
];

/** Snapshot variants. Today's data is the easy case; these are the hard ones. */
function variants(real) {
  const repos = real.repos || [];
  return {
    real,
    // Nothing has happened anywhere. Every section must degrade gracefully
    // rather than printing a joke that doesn't land on an empty queue.
    quiet: {
      ...real,
      repos: repos.map((r) => ({
        ...r, openPRs: [], openIssues: [], branches: [], commits: [],
        daily: new Array(30).fill(0),
        counts: { ...r.counts, openPRs: 0, openIssues: 0, branches: 0, commits7d: 0, commits30d: 0 },
      })),
      tasks: [], attention: [],
      summary: { ...real.summary, openPRs: 0, openIssues: 0, commits7d: 0, needsAttention: 0, activeRepos: 0 },
    },
    // A lead with a commit message worth setting large. The pull quote has to
    // actually appear, or the whole feature could rot away unnoticed — today's
    // real lead legitimately may have nothing quotable, so `real` can't carry
    // this assertion.
    quotable: {
      ...real,
      repos: repos.map((r, i) => (i ? r : {
        ...r,
        commits: [{ ...(r.commits?.[0] || {}), message: "Make local service onboarding checkout-safe" }],
      })),
    },
    // A lead whose only commit is unquotable. The pull quote must be omitted,
    // not set anyway and not left as a hole in the copy.
    unquotable: {
      ...real,
      repos: repos.map((r, i) => (i ? r : {
        ...r,
        commits: [{
          ...(r.commits?.[0] || {}),
          message: "Merge pull request #99 from joseph-robert-f/some/rather/long/branch-name-here",
        }],
      })),
    },
    // The account with no public repos at all.
    empty: {
      ...real, repos: [], tasks: [], attention: [],
      summary: { repos: 0, activeRepos: 0, commits7d: 0, openPRs: 0, openIssues: 0, needsAttention: 0 },
    },
  };
}

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

async function probe(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const lead = q("article.lead");
    const body = lead && lead.querySelector(".body");
    const text = document.body.innerText;
    return {
      hasLead: !!lead,
      align: body ? getComputedStyle(body).textAlign : null,
      pull: q(".pullquote") ? q(".pullquote").innerText.replace(/\s+/g, " ").trim() : null,
      jump: !!q(".jump"),
      folio: q("#folio") ? q("#folio").innerText.trim() : "",
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bad: (text.match(/NaN|undefined|Invalid Date|\[object Object\]/g) || [])[0] || null,
      chrome: [...document.querySelectorAll(".mast-top, #tip")]
        .map((e) => getComputedStyle(e).display),
      engravings: [...document.querySelectorAll("figure svg")]
        .map((s) => `${s.outerHTML.length}:${s.getAttribute("aria-label")}`),
      moving: [...document.querySelectorAll("*")]
        .filter((el) => {
          const s = getComputedStyle(el);
          return (s.animationName !== "none" && s.animationDuration !== "0s")
            || (s.transitionDuration !== "0s" && s.transitionProperty !== "none");
        })
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}`),
      // A caption may only claim a language when the drawing really came from
      // it. Six motifs don't go round thirteen projects, so planMotifs() hands
      // plenty of them something outside their language's pair, and saying
      // "a cog, after the HTML" is a plain untruth about how the page is made.
      lyingCaptions: [...document.querySelectorAll("figcaption")]
        .map((f) => f.innerText)
        .filter((text) => {
          const m = text.match(/: (.+?), after the (.+?);/);
          if (!m) return /after the/.test(text);   // any other "after the" phrasing is suspect
          const kind = MOTIF_NAMES.indexOf(m[1]);
          return kind < 0 || !(MOTIF_BY_LANGUAGE[m[2]] || []).includes(kind);
        }),
    };
  });
}

async function main() {
  const { chromium } = await import("playwright");
  copyFileSync(SNAP, BAK);
  const real = JSON.parse(readFileSync(BAK, "utf8"));
  // CHROMIUM_PATH lets an environment that already has a browser on disk skip
  // `npx playwright install`.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  let checks = 0;

  try {
    for (const [name, data] of Object.entries(variants(real))) {
      writeFileSync(SNAP, JSON.stringify(data, null, 2) + "\n");

      for (const shape of SHAPES) {
        const where = `${name}/${shape.label}`;
        const errs = [];
        const page = await browser.newPage({
          viewport: shape.viewport,
          colorScheme: shape.colorScheme,
          reducedMotion: shape.reducedMotion,
        });
        page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
        page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
        if (shape.print) await page.emulateMedia({ media: "print" });
        await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
        await page.waitForTimeout(400);

        const p = await probe(page);
        checks++;

        for (const e of errs) fail(where, e);
        if (p.bad) fail(where, `"${p.bad}" reached the page`);
        if (p.overflow > 0) fail(where, `${p.overflow}px of horizontal overflow`);
        if (!p.folio) fail(where, "no folio");
        for (const c of p.lyingCaptions) fail(where, `caption claims a language it didn't use: "${c}"`);
        if (shape.reducedMotion === "reduce" && p.moving.length) {
          fail(where, `still animating: ${p.moving.join(", ")}`);
        }

        if (name !== "empty") {
          if (!p.hasLead) fail(where, "no lead article");
          if (!p.jump) fail(where, "lead has no jump line");
          const wide = shape.viewport.width > 560;
          const want = wide ? "justify" : "left";
          if (p.align !== want) fail(where, `lead body is ${p.align}, expected ${want}`);
        }
        if (name === "unquotable" && p.pull) fail(where, `set an unquotable pull quote: ${p.pull}`);
        if (name === "quotable" && !p.pull) fail(where, "a quotable lead set no pull quote");
        if (shape.print && p.chrome.some((d) => d !== "none")) {
          fail(where, "interactive chrome is still visible in print");
        }
        if (name === "real" && shape.label === "desktop") {
          const kinds = new Set(p.engravings.map((e) => e.split(", standing for")[0]));
          if (p.engravings.length >= 4 && kinds.size < 3) {
            fail(where, `only ${kinds.size} distinct motifs across ${p.engravings.length} articles`);
          }
        }
        await page.close();
      }
    }

    // The same issue must always set the same page. Reordering the projects
    // stands in for tomorrow's ranking: the drawings must not follow it.
    writeFileSync(SNAP, JSON.stringify(real, null, 2) + "\n");
    const page = await browser.newPage({ viewport: { width: 1250, height: 900 } });
    const render = async () => {
      await page.goto(`${BASE}/index.html`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      return (await probe(page)).engravings;
    };
    const first = await render();
    if (JSON.stringify(first) !== JSON.stringify(await render())) {
      fail("determinism", "engravings differ between two loads of the same issue");
    }
    checks++;

    const key = (list) => new Map(list.map((e) => {
      const m = e.match(/^\d+:A woodcut of (.+), standing for (.+)$/);
      return m ? [m[2], m[1]] : [e, e];
    }));
    writeFileSync(SNAP, JSON.stringify({ ...real, repos: [...real.repos].reverse() }, null, 2) + "\n");
    const reordered = key(await render());
    for (const [repo, motif] of key(first)) {
      if (reordered.get(repo) !== motif) {
        fail("stability", `${repo} is drawn as ${motif} today and ${reordered.get(repo)} when reordered`);
      }
    }
    checks++;
    await page.close();
  } finally {
    await browser.close();
    copyFileSync(BAK, SNAP);
    unlinkSync(BAK);
  }

  if (failures.length) {
    console.error(`\n${failures.length} problem(s) across ${checks} checks:\n`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`all ${checks} render checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
