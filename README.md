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

Headlines, decks and body copy are generated from the snapshot. Each category carries
several phrasings, picked by a hash of the repo's name, so a page with four quiet
projects doesn't print the same headline four times — but the same snapshot always sets
the same page. Nothing is random, because a line that changes when the data didn't is a
line you stop trusting.

## The engravings

Every article gets one, and they are **drawn in code** rather than produced by an image
model. Each is seeded from a hash of the repo's name — six woodcut motifs plus halftone
and hatching — so it is stable forever and any repo added later gets its own with no
manual step. Ink weight follows `status`, so a busy project looks heavily worked and a
dormant one looks faint: the picture carries the same signal as the placement.

No image files, no API, no build step, and nothing to regenerate on a schedule.

## Layout

```
index.html                       the whole front page — inline CSS + JS, no deps
data/snapshot.json               fetched from repo-radar; what the page reads
editions/<YYYY-MM-DD>.json       one archived edition per day, pruned to 90
editions/index.json              dates plus a digest per day, kept forever
scripts/edition.mjs              files today's edition into the archive
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

## Setup, once

Settings → Pages → Build and deployment → **Source: GitHub Actions**. That's all; the
workflow does the rest and needs no secrets.
