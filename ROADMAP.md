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

## Sprint 3 — Set in type

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

- **Visual regression.** Rendering is currently checked by eye against screenshots. A
  small Playwright script that renders the light, dark, mobile, all-quiet and
  nothing-at-all states and diffs against committed baselines would catch layout
  regressions for very little effort. Worth doing before Sprint 3 moves the type around.
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
