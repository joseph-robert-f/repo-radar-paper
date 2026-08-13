# Roadmap — fleshing out the broadsheet

Four sprints, ordered so each one ships something you'd notice on its own. Sprint 1 is
the one that changes what the paper is *for*; the rest make it a pleasure to read.

Read `README.md` first for how the two repos fit together.

---

## Constraints that shape all of this

Restating them because every sprint below bumps into at least one.

**Nothing random.** The same snapshot must always set the same page. A line that changes
when the data didn't is a line you stop trusting. Variation comes from hashing the data
(repo names, dates), never from `Math.random()`. This applies to headlines, engravings,
forecasts — everything.

**No dependencies, no build step.** The page is one file the browser reads directly.

**The browser never calls an API.** Everything the page needs is a static file sitting
next to it. This rules out anything that reads GitHub live at render time.

**Presentation only.** Data comes from `repo-radar`'s snapshot. New *fields* mean a
collector change over there; new *derivations* of existing fields belong here.

### One decision to make early — reviewed at Sprint 2, deferred

`index.html` was ~700 lines when this was written. Sprints 1–4 plausibly take it past
2,500, and at some point "one file" stops being a virtue and starts being a liability.

The cheap escape is **native ES modules** — `<script type="module">` with a few local
`.mjs` files. Browsers do that with no build step and no dependencies, so the rule that
actually matters ("no toolchain") survives intact.

**Reviewed at the top of Sprint 2 and deferred.** The file came out of Sprint 2 around
1,200 lines and is still navigable: one clearly-labelled function per section, in the
order they appear on the page. Splitting now would trade a real cost (four more files
to open, an import graph to hold in your head) for a hypothetical one. **Revisit at
Sprint 4**, which adds cross-cutting behaviour — keyboard handling, expansion state,
routing — that genuinely wants its own module rather than more functions in a pile.

Sprint 3 added about a hundred lines, so the file stands at roughly 1,300. It also added
the first piece of render-scoped state (`motifPlan`), which is the kind of thing a module
boundary exists to hold. Still fine as one file; still the Sprint 4 decision.

---

## Sprint 1 — Since the last edition ✅ shipped

**The point:** a newspaper you read every day should tell you what changed since
yesterday. Right now every load looks identical, so reviewing means re-reading the whole
page and diffing it in your head. This is the single biggest review-value win available.

**The insight that makes it cheap:** this repo already keeps history. Every
`chore: set from a fresh snapshot` commit is a back issue. It just isn't reachable from
the browser, so materialise it.

### Ships

- **`editions/` archive.** The workflow writes `editions/<YYYY-MM-DD>.json`, one per UTC
  day, last write wins, plus `editions/index.json` listing available dates.
- **A "Since the last edition" box**, top of the rail above Stop Press:
  reviews opened, merged or closed; issues opened and closed; branches that appeared or
  landed; repos that changed status; commits since.
- **Per-article kickers** — `NEW`, `MOVED`, `UNCHANGED` beside the existing status pip.
- **Back issues** — a date picker in the masthead. Pick a day, the page sets itself from
  that edition. Genuinely delightful, and useful when you want "where was I on Friday".

### Watch out

Store a **reduced** edition, not the whole snapshot. The delta only needs repo names,
statuses, counts, PR/issue numbers and branch names — roughly 5KB a day against ~80KB
for the full file. Ninety days of reduced editions is under half a megabyte; ninety days
of full snapshots is seven megabytes and growing forever. Prune on write.

First run has no previous edition. The box must say something graceful rather than
claiming everything is new.

### Done when

The delta box is correct against two hand-checked consecutive editions; back issues load
and render; the page works with an empty `editions/`; the archive prunes; and a day with
no change adds no commit.

**Size:** large. Workflow plus page. No `repo-radar` change needed.

**Shipped.** `scripts/edition.mjs` files the archive; the workflow commits editions
alongside the snapshot and still skips a commit when only the timestamp moved. The page
diffs today against the newest archived day, renders the box and the `New`/`Moved`
chips, and the masthead picker re-sets the paper from any archived day. Rich editions
measured at 11.9KB, so retention went to ninety days rather than thirty. Verified
against a synthetic previous edition covering an opened review, a landed branch, a
status change and a new project, plus the first-run path where no history exists.

---

## Sprint 2 — More of the paper ✅ shipped

**The point:** whimsy that carries data. Every new section below is a real view of real
work, wearing a newspaper's clothes. Nothing here is decoration for its own sake.

### Ships

- **Classifieds** — open reviews as small ads, set in the classic dense column.
  *"WANTED: one reviewer for #4, deps-service. Python. Six days waiting. Apply within."*
  It is the review queue, and it is funnier and more scannable than a list.
- **Letters to the Editor** — assigned open issues, set as letters and signed off.
  *"Sir — the map stutters above two thousand aircraft. I remain, yours, the assignee."*
- **Obituaries** — repos that crossed into dormant *since the last edition*, with a line
  on when they were last seen. Needs Sprint 1's history to know when the crossing
  happened. Archived repos would fit here too, but that needs `includeArchived` turned
  on in `repo-radar`.
- **The Forecast** — a short, rule-based projection from `repos[].daily`.
  *"Light commits continuing through midweek. The review queue is expected to lengthen."*
  Deterministic: same series, same forecast.
- **On This Day** — one line pulled from the oldest back issue that shares today's date.

### Watch out

Resist writing jokes into templates that will fire on data that isn't funny. An
obituary for a repo someone is about to pick back up should read gently. Test each new
section against the all-quiet and nothing-at-all snapshots, not just today's data.

### Done when

Each section renders correctly with real data, degrades to nothing when its data is
absent, and reads sensibly in the quiet and empty states.

**Size:** medium, and very parallelisable — each section is independent.

**Shipped.** All five, plus a back page holding Classifieds and Letters in two ruled
columns below the articles. Obituaries, the Forecast and On This Day sit in the rail.

Three notes worth keeping. Letters run **every** open issue, not just assigned ones —
restricting to assigned left the section permanently empty on real data, and an
unassigned issue is still a letter; it's just signed "a correspondent" instead of "the
assignee". The Forecast and On This Day pick one number format per sentence, because
`spell()` falls back to numerals above twenty and "Eighteen commits against 33" reads
like a typo. Obituaries and On This Day depend on history, so they stay absent until
the archive has depth — verified against synthetic editions, which were removed before
committing.

Verified against real, all-quiet and deliberately-overloaded snapshots (sixteen vacant
positions, three letters), at 1250px and 390px. No overflow, no console errors, no NaN.

---

## Sprint 3 — Set in type ✅ shipped

**The point:** the layout is a newspaper but the typography is only halfway there. This
is the sprint that makes it look *printed*.

### Ships

- **Drop cap** on the lead article.
- **Pull quote** — the most recent commit message, set large between the lead's columns.
- **Jump lines** — *"Continued on page 2"* with a working anchor, for stories that run long.
- **Folios and section rules** — page furniture that sells the conceit.
- **Justified columns with hyphenation** (`hyphens: auto`), which is what makes a column
  read as a column rather than a ragged list.
- **A print stylesheet.** The payoff joke: `Cmd-P` and it prints as an actual broadsheet.
  `@page` margins, interactive chrome hidden, forced columns, ink-on-white.
- **Smarter engravings** — motif chosen by language and project shape rather than pure
  hash, so a Python pipeline gets gears and a news site gets a skyline. Still
  deterministic, just less arbitrary.

### Done when

It prints legibly on A4 and US Letter; columns justify without rivers at 390px and at
1250px; every engraving still renders identically for the same repo name.

**Size:** medium. Pure presentation, no data changes, low risk.

**Shipped.** All seven. Four notes worth keeping.

**The lead had no commits to quote.** `repo-radar-paper` was leading its own paper: every
commit in it is the bot filing an edition, bot commits are filtered out, so it carried
zero commits — a top story with nothing to report and nothing to pull-quote. Same cause
as `repo-radar` hiding itself. Fixed over in `repo-radar` by adding this repo to `hide`;
the rule now written down there is that anything whose only commits come from this
pipeline belongs in that list.

**A pull quote is a choice, not the newest row.** The first version quoted the most recent
commit and got *"Merge pull request #14 from joseph-robert-f/codex/service-o…"* set at
19px between the columns — machine bookkeeping, not something a person said. `quotable()`
now walks back through the week for the most recent message that isn't a merge, a revert,
a truncated fragment, or over 84 characters, and sets nothing at all if none qualifies.

**Language-keyed motifs made the page *less* varied, twice.** Keying each motif on
language put an orbit on four of this account's projects, because four of them are
TypeScript. Giving each language a pair and hashing between them still landed three
orbits in the first five articles — a hash mod 2 doesn't spread four items. What works is
planning the whole issue in one pass, in name order over every project, letting each take
the best motif not yet spent. Name order matters: page order is the activity ranking and
reshuffles daily, so planning against it would redraw a project between issues.

**The heatmap doesn't print.** It's 570px of fixed-size cells inside a scroller, and the
printed rail is a third of an A4 page, so it ran 218px off the edge. Print shrinks the
cells to 3px rather than clipping months off the left.

Verified with Playwright against real, all-quiet, over-long-quote and nothing-at-all
snapshots, at 1250px, 390px, A4 and US Letter widths in print media, light and dark: no
console errors, no NaN, no horizontal overflow in any of the twenty combinations. Motif
assignment confirmed identical across two loads of the same issue and across a
deliberately reordered one.

---

## Sprint 3½ — A voice worth reading ✅ shipped

Not originally on the list. It came out of the QA pass on Sprint 3: the typography was
right and the page still read like a status report written by someone having a bad week.

**Every story now has an angle.** `angleFor()` picks the most interesting true thing
about a project — streak, milestone, waking up, a surge, a clean desk, a queue, a rest,
parked work, sleeping — and the headline, the opening line and the fact ordering all
follow from it. Each angle carries four to six phrasings and `planHeadlines()` spreads
them across the page, restarting the cycle when an angle has more projects than forms.

**The register warmed up throughout** — the lede, Stop Press, Classifieds, Letters, the
Forecast, the empty states, and *Obituaries*, which is now *Gone to Sleep* because being
condoled with over your own side project is a strange experience.

What kept catching us out was the difference between cheerful and untrue. Four separate
fixes, all the same mistake:

- "A quiet week after a **productive** month" fired on a month with one commit.
- "**The desk is clear here**" printed for a project whose two branches Stop Press was
  simultaneously reporting as the oldest thing waiting.
- "A Well-Earned Quiet Week at …" ran on a project whose branches had sat 96 days —
  fixed by preferring the *parked* angle over *breather* when the month was thin.
- "**A** HTML project", and sentences mixing "seven" with "33".

The rule that came out of it: warmth lives in how a true thing is said, never in saying a
nicer thing. `numerals()` now enforces one number format per sentence in one place rather
than three, and `article()` handles "an HTML".

Also fixed here, both found by the same pass and both pre-existing: `--ink-3` measured
3.97:1 in light mode — under WCAG AA for the kickers, bylines, captions, folio and legend
that use it — and is now `#726f66` at 4.64:1; and the theme toggle didn't survive a
reload, so the choice is remembered in `localStorage` now, wrapped because it throws
outright in a few browser configurations.

---

## Sprint 5 — The rest of the paper ✅ shipped

**The point:** a real newspaper is mostly not news. The sections around the reporting are
what make it a paper you *read* rather than a page you scan — and every one of these
carries data that was already in the file.

### Shipped

**Three fields the paper had been throwing away.** `additions`, `deletions` and
`reviewDecision` were collected from day one and never printed. Classified ads are now
sized by their own diff — *"a substantial undertaking — 16,984 added, 729 removed"* rather
than *"waiting one day"* — and an **approved-but-unmerged** review sorts to the top with a
rule down its side. That state is the most actionable thing in the dataset, somebody
having already said yes, and the paper simply couldn't express it before.

**The Editorial.** The one place the paper has an opinion. A list can state that a branch
has waited ninety-seven days; only a leader column can say that ninety-seven days is too
long. Rule-based, so the position follows from the numbers, with a branch for every state
including "nothing to editorialise about, which is its own kind of good news".

**In Tomorrow's Paper.** The only forward-looking thing on the page: threshold crossings
due within the week, from dates already in the snapshot. *"Tomorrow — Pantry Pal slips
into dormancy unless something lands."* Two threads in one project crossing the same mark
collapse into one announcement.

**Births, Marriages & Deaths.** Branches born, reviews married into the trunk, issues laid
to rest, branches departed. The oldest column in any newspaper and a perfect fit for a
diff.

**Corrections & Clarifications.** Editions now store the two figures their forecast rested
on, and the next day's paper marks them. It is the funniest thing on the page and it is
also the reason the Forecast is worth reading at all.

**Advertisements.** One period trade notice per language present. Pure filler, and filler
is what separates a newspaper from a dashboard.

### Watch out — the thing that caught us three times

`{week, before, queue}` is stored as **arithmetic only**. The temptation is to store the
trend label too, which puts one judgement in two files and lets them drift; `trendOf()`
lives in the page and nowhere else. Same discipline as everything else here: editions hold
facts, the page holds opinions.

The other trap is claiming more than the data supports. *Steady* can never be marked
wrong, so Corrections doesn't try; and an ad with no churn says "nothing at all to read"
rather than printing "0 added, 0 removed".

**Verified.** 44 render checks across six snapshot states and six shapes. Three new
assertions — the Editorial always printing, exactly one approved ad sorting first, one
advert per language — were each confirmed to **fail against the unfixed code** before
being kept. Corrections and Births/Marriages/Deaths were exercised against a synthetic
previous edition carrying a deliberately wrong forecast, a merged review, a resolved
issue, a new branch and a landed one; the synthetic edition was removed before committing.

---

## Sprint 6 — The Crossword ⬜ next

The one thing a newspaper has that nothing else does, and a real generation algorithm
rather than a template. Notes from looking at the data:

- **Don't source it from commit messages.** The week's top words are *from, merge, pull,
  request, joseph, robert* — merge-commit noise, and only 61 commits to draw on. Build the
  word bank from **repo names, languages and branch words**, which are clean, plentiful
  and recognisable.
- Clue from the numbers, so solving it means reading the data: *"Project that logged
  eleven commits this week (8,6,9,7)"*.
- Deterministic, like everything else: the same issue must always set the same grid.
- Interactive but keyboard-first, and it must degrade to a printed grid — the print
  stylesheet is the payoff and a crossword you can't solve on paper is a waste of it.

---

## Sprint 4 — The reader's hand

**The point:** "dynamic" in the sense that matters — the page responds to you. Today it
is a poster.

### Ships

- **Expand a story in place** to see its full commit list, reviews and branches, instead
  of leaving for GitHub.
- **A newsstand rail** — section tabs (All · Live · Waiting · Asleep) styled as newspaper
  section heads.
- **Keyboard** — `j`/`k` between stories, `Enter` to open, `/` to search. A review tool
  you can drive without a mouse.
- **Deep links** — `#story-<repo>`, so you can send someone a single story.
- **Times that tick** — relative times update without a reload, so a tab left open
  overnight isn't lying.

### Watch out

Every bit of motion goes behind `prefers-reduced-motion`. Keyboard shortcuts must not
capture keys while the search field has focus.

### Done when

Everything is reachable by keyboard, focus is visible throughout, deep links survive a
reload, and an expanded story is still correct after switching back issues.

**Size:** medium-large.

---

## Cross-cutting, pick up during any sprint

- ~~**Visual regression.**~~ ✅ **Done in Sprint 3** — `scripts/render-check.mjs`. It
  turned out that *assertions* beat committed image baselines here: a baseline diff goes
  red every time the real snapshot changes, which is every day, so nobody would look at
  it. Instead it renders four snapshot states across five shapes and fails on the things
  that are always wrong — console errors, `NaN` on the page, horizontal overflow, chrome
  visible in print, engravings that move between renders. Run it before pushing; it needs
  Playwright, so it isn't in the publish workflow.
- **Accessibility pass.** Landmarks, heading order, SVG roles and labels, focus rings,
  and a contrast check in both themes. The engravings need sensible alt text — currently
  they all say much the same thing.
- **Performance budget.** Thirteen inline SVGs with a few hundred elements each is fine
  today, but Sprint 2 adds sections and Sprint 1 adds a second fetch. Set a budget now.

---

## Backlog — deliberately not scheduled

- **Real AI images.** Revisit if image generation becomes available to whoever is
  working on this. The seam is one function, `engraving()`. The reasons it wasn't done
  are in `README.md`.
- **A crossword.** Genuinely appealing, genuinely a real generation algorithm, and a
  whole sprint on its own. Only if the paper is otherwise finished.
- **Real comments as Letters.** Would need issue and PR comment bodies in the snapshot,
  which is a meaningful collector change and a lot more text to carry.
- **Multi-page pagination.** The conceit is a *front page*. Page two is a different
  product; decide that deliberately rather than drifting into it.
