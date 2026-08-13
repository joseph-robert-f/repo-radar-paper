# The Repo Radar — broadsheet edition

A newspaper front page of activity across [joseph-robert-f](https://github.com/joseph-robert-f)'s
public repositories. One project per article; where a story sits and how big it runs is
the data.

**Live:** https://joseph-robert-f.github.io/repo-radar-paper/
**Data view:** https://joseph-robert-f.github.io/repo-radar/

---

## This repository is presentation only

Nothing here talks to the GitHub API. The collecting happens in
[`repo-radar`](https://github.com/joseph-robert-f/repo-radar), which publishes
`data/snapshot.json`; this repo fetches that file, commits it when it has actually
changed, and deploys the page.

```
repo-radar          collects every 6h  →  data/snapshot.json
        ↓ raw.githubusercontent.com (public, no auth)
repo-radar-paper    fetches, commits if changed, deploys Pages
```

Two consequences worth knowing:

- **No secrets.** `repo-radar` is public, so its snapshot is readable with no
  credentials at all. There is no deploy key, no PAT, nothing to rotate.
- **Visitors never call GitHub.** The page reads a static file sitting beside it, same
  as the dashboard does. No API keys in the browser, no rate limits for readers.

The workflow runs on a cron offset from `repo-radar`'s so it picks up fresh data rather
than racing it, and it skips the commit when only the timestamp moved.

---

## Placement is the data

| Placement | Who gets it |
|---|---|
| Lead — full column width, largest engraving, two-column body | the most recently active project |
| Second front — a third of the page each | the next two |
| Standard — smaller engraving | remaining live projects |
| In Brief — one line, no art | dormant projects |
| Stop Press — boxed, top of the rail | anything stale |
| Classifieds — back page | open reviews, set as small ads |
| Letters to the Editor — back page | open issues, signed off |
| Obituaries — rail | projects that went dormant since the last edition |
| The Forecast — rail | last seven days of commits against the seven before |
| On This Day — rail | the same date in an older edition |
| The Year in Weather | the commit heatmap, with month labels |

## The voice

Headlines, decks and body copy are generated from the snapshot, and the same snapshot
always sets the same page. Nothing is random, because a line that changes when the data
didn't is a line you stop trusting.

**Every story has an angle.** `angleFor()` looks at a project and works out what the most
interesting true thing about it is — a streak, a round number passed, a project waking up
after a fortnight, a queue worth an afternoon, a well-earned quiet week — and the
headline, the opening line and the ordering of everything after it all follow from that.
Before this, each article marched through the same three facts in the same order, which
made twelve stories read as one story printed twelve times.

**Phrasing is planned for the page, not the story.** Each angle carries several
constructions, and `planHeadlines()` hands them out so the page doesn't print the same
one twice — hashing per project is varied on average and repetitive in practice, which is
how two adjacent stories both came out as *"A Well-Earned Quiet Week at …"*. When an
angle has more projects than phrasings, the cycle restarts rather than piling the
remainder onto whichever form the hash lands on.

**Warm, but never flattering.** The register is cheerful — a dormant project is *sleeping
soundly*, an empty postbag *delights the editor*, and the list of quiet repos is headed
*Sleeping Soundly* rather than *In Brief*. What the copy never does is overstate the
data. "A productive month" only prints when the month was actually productive; a project
with one commit gets *"ticking over rather than racing"*. The moment a page flatters you
it stops being worth reading, and the whole point of this one is that you believe it.

Three rules the copy follows that are easy to break by accident:

- **One number format per sentence.** `spell()` gives words up to twenty and numerals
  above, so *"Eighteen commits against 33"* reads like a typo. `numerals()` takes every
  figure a sentence will use and picks one form for all of them.
- **Don't say it twice.** The second paragraph drops any fact the opening line already
  covered, and if that leaves nothing, it doesn't run. It certainly doesn't print "the
  desk is clear here" for a project whose branches Stop Press is reporting as the oldest
  thing waiting.
- **Sections must agree.** The lede, the headline and Stop Press are three views of one
  snapshot; when they contradict each other the reader stops trusting all three.

## The engravings

Every article gets one, and they are **drawn in code** rather than produced by an image
model. Halftone and hatching are seeded from a hash of the repo's name, so the texture is
stable forever and any repo added later gets its own with no manual step. Ink weight
follows `status`, so a busy project looks heavily worked and a dormant one looks faint:
the picture carries the same signal as the placement.

The *subject* — one of six woodcut motifs: a ridgeline, a swell, a skyline, an orbit, a
cog, a canopy — follows the project's **language**, so a Python pipeline gets a cog and a
site gets a skyline. Each language names two motifs rather than one, and the whole issue
is planned in a single pass so a page doesn't repeat a drawing it needn't: keying on
language alone put three orbits in the first five articles, because four of these
projects are TypeScript.

That pass runs over the projects in **name order**, not in the order they appear on the
page. Page order is the activity ranking and it reshuffles daily; planning against it
would draw the same project differently in yesterday's paper than in today's. Name order
changes only when a project is created or hidden, so an engraving holds still the way a
woodblock should.

No image files, no API, no build step, and nothing to regenerate on a schedule.

## Set in type

The typography is doing a job, not a costume:

- A **drop cap** opens the lead. The dateline sits in the byline rather than at the head
  of the copy, so the cap lands on prose instead of on the first letter of a username.
- A **pull quote** between the lead's columns carries its most recent commit message —
  but only if that message is worth setting at 19px. Merge commits, reverts, anything the
  collector truncated, and anything over 84 characters are skipped, walking back through
  the week's commits for something better. If nothing qualifies there is no pull quote:
  a blank space beats a bad quote.
- **Justified columns with hyphenation**, switched back to ragged right below 560px where
  a justified column is all rivers.
- A **jump line**, a **folio** and section rules — the page furniture that sells it.
- A **print stylesheet**. `Cmd-P` and it comes out as a broadsheet: `@page` margins,
  ink on white, interactive chrome gone, the year-in-weather grid shrunk to fit a printed
  rail rather than scrolled off the edge, and each jump line printing its destination
  since a printed link can't be clicked.

## Layout

```
index.html                       the whole front page — inline CSS + JS, no deps
data/snapshot.json               fetched from repo-radar; what the page reads
editions/<YYYY-MM-DD>.json       one archived edition per day, pruned to 90
editions/index.json              dates plus a digest per day, kept forever
scripts/edition.mjs              files today's edition into the archive
scripts/render-check.mjs         renders every state and shape; run before pushing
.github/workflows/publish.yml    fetch, file, commit if changed, deploy Pages
ROADMAP.md                       what's planned, and why
```

## Back issues and the daily delta

The paper keeps its own archive. Every refresh reduces the snapshot to an edition and
files it under `editions/`, one per UTC day. That buys two things:

- **"Since the last edition"** — a box at the top of the rail saying what actually moved:
  reviews opened and closed, issues raised and resolved, branches landed, projects that
  woke up or drifted off. Articles carry a `New` or `Moved` chip to match.
- **Back issues** — a date picker in the masthead. Pick a day and the paper re-sets
  itself as it stood then, weather box omitted since editions don't carry the heatmap.

Two tiers, so the archive doesn't grow without limit: rich editions (~12KB) are pruned
to ninety days, while the ~100-byte digest of each day in `index.json` is kept forever.
Storing whole snapshots instead would cost roughly 7MB a quarter.

Editions carry **no timestamps that move on their own** — no `generatedAt`. A refresh
that finds nothing new has to produce a byte-identical edition, or the workflow's
"don't commit if nothing changed" check quietly stops working, which is a trap
`repo-radar` fell into three separate times.

## Local preview

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

`file://` won't work — browsers block the `fetch` of `data/snapshot.json`. The page says
so if you try.

## Checking a change before you push it

```bash
python3 -m http.server 8000 &
npm i --no-save playwright && npx playwright install chromium
node scripts/render-check.mjs
```

It renders six snapshot states — real, all-quiet, an archived edition's shape, a lead
worth quoting, a lead with nothing worth quoting, and an account with no repos at all —
across six shapes: 1250px, 390px, dark, reduced-motion, and print at A4 and US Letter
widths. It fails on a console error, a `NaN` or `undefined` reaching the page, any
horizontal overflow, a pull quote that shouldn't have been set, a caption claiming a
language the drawing didn't come from, chrome left visible in print, anything still
animating under `prefers-reduced-motion`, or engravings that move between renders.

Every one of those has gone wrong at least once, which is the only reason each check is
there. Two of them were added *after* watching them fail against the unfixed code — a
check that passes but wouldn't have caught the bug is worse than no check, because it
tells you the bug can't happen.

Playwright is a dev-only dependency and deliberately isn't in a `package.json`: the
published site still has no dependencies, no build step and no lockfile. The check isn't
part of the publish workflow either, since it would mean downloading a browser every six
hours to test a page that only changes when someone edits it.

## Setup, once

Settings → Pages → Build and deployment → **Source: GitHub Actions**. That's all; the
workflow does the rest and needs no secrets.
