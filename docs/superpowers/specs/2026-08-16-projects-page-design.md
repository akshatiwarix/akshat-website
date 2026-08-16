# /projects — design

A new page that shows the GTM tools Akshat has shipped, as a grid of tiles, each
one previewing the live app itself. Decided 16 Aug 2026.

---

## 1. Why this page exists

`/work` describes the machinery. Nothing on the site lets a stranger check it.
Seven public repos are already deployed and clickable, which clears the bar
`PROOF-OF-WORK.md` sets — a stranger can verify them without asking Akshat for
anything — and clears it more directly than a repo link does, because they can
use the thing rather than read its source.

This page does not replace the Proof of work placeholder in `work/index.html`.
That block waits on the evidence-linked dataset artifact, which is a different
kind of proof and keeps its own slot.

## 2. Scope

Seven tiles, in this order:

| # | Project | Demo |
|---|---------|------|
| 1 | icp-score | icp-score.vercel.app |
| 2 | enrichment-waterfall | enrichment-waterfall.vercel.app |
| 3 | signal-scout | signal-scout-weld.vercel.app |
| 4 | lead-cleaner | lead-cleaner-smoky.vercel.app |
| 5 | persona-mapper | persona-mapper.vercel.app |
| 6 | why-now | why-now.vercel.app |
| — | girth-of-nations | girth-of-nations.doorhandles.workers.dev |

The first six are GTM systems and form the grid. `girth-of-nations` sits below a
divider under an "Off the clock" kicker — it shows range without diluting the
GTM thesis on a page recruiters read.

Excluded: `account-brief` (no live demo — a code-only tile in a grid built on
previews reads as broken), `techstack-icp` (empty, no description),
`akshat-website` (this site).

The order is editorial, hand-set as the array order in `projects.json`. It is
not derived from push dates.

## 3. Route, shell, nav

- New generated page at `/projects/index.html`.
- Nav becomes: Home · Work · **Projects** · Blog · Beyond Work · Contact.
  Projects sits beside Work so the claim and the evidence are adjacent.
- `build.js` copies the page shell from the hand-written pages, so the nav edit
  is made in `index.html`, `work/index.html`, `beyond-work/index.html` and
  `contact/index.html`, then a rebuild propagates it into `blog/`.
- `/projects/` is added to `STATIC_PAGES` in `build.js` (currently line 682) so
  it appears in `sitemap.xml`.
- `/work` gains one line above the tool stack linking to `/projects`.

## 4. Data model

`projects.json` at the repo root is the single source of truth. Array order is
page order. One entry per tile:

```json
{
  "slug": "icp-score",
  "name": "icp-score",
  "blurb": "Explainable ICP account scoring — deterministic weighted criteria with hard disqualifiers, so every score traces back to the rule that produced it.",
  "tags": ["TypeScript", "Deterministic"],
  "demo": "https://icp-score.vercel.app",
  "repo": "https://github.com/akshatiwarix/icp-score",
  "shot": "/assets/projects/icp-score.webp",
  "status": "Live",
  "group": "gtm"
}
```

- `group` is `"gtm"` or `"aside"`. `"aside"` entries render below the divider.
- `demo` is required; a tile without one does not belong on this page.
- `blurb` is 2–3 lines of prose, drafted from the repo README and edited by
  Akshat. It is not a copy of the tool stack line on `/work`, and it names
  systems rather than SaaS, per `CONTEXT.md`.
- `tags` are short, 2–3 per tile, describing the engineering (TypeScript,
  Deterministic, No LLM), never the GTM tool stack.

`build.js` reads this file, renders the tiles, and writes `/projects/index.html`
between `PROJECTS:GRID` markers using the same shell-copy approach the blog
already uses. Like `blog/`, the generated page is never hand-edited.

## 5. Tile anatomy

Uniform two-column grid, 32px gutter, equal-height tiles, collapsing to one
column below 700px.

```
┌──────────────────────────────┐   1px #e6e6e6, sharp corners, no shadow
│ icp-score.vercel.app         │   chrome bar: kicker 12px, #808080, 1px bottom rule
├──────────────────────────────┤
│ [ shot, 16:10, grayscale(1) ]│   overflow hidden, lazy, width/height attributes
├──────────────────────────────┤
│ icp-score          [GitHub]  │   Raleway 22px 400 · corner link Roboto 13px #808080
│ Explainable ICP scoring…     │   Roboto 17px, line-clamp: 3
│ TypeScript · Deterministic   │   pill tags, 9999px radius, 1px #e6e6e6
│ Live · Aug 2026              │   caption 13px #808080
└──────────────────────────────┘
```

The tile is an `<article>`, not an anchor. The project title is an `<a>` to the
demo carrying a `::after` that stretches over the whole tile, which makes the
full tile clickable while keeping the GitHub corner link a separate, valid,
keyboard-reachable anchor. Nested anchors would be invalid HTML and would break
tab order.

The chrome bar is a hairline rule with the demo hostname in kicker type. No
traffic-light dots, no rounded window corners — it reads as a website using only
tokens already in `DESIGN.md`.

Every token here already exists: `#000000`, `#808080`, `#e6e6e6`, `#ffffff`,
Raleway for the title, Roboto for everything else, sharp corners on the tile,
pill radius on the tags, no shadows anywhere.

## 6. Motion

One 200ms ease, fired on tile hover and on `:focus-within`:

- border `#e6e6e6` → `#000000`
- image `filter: grayscale(1)` → `grayscale(0)`
- image `transform: scale(1)` → `scale(1.03)` inside the clipped frame

Reveal reuses the existing `[data-reveal]` IntersectionObserver in `site.js`
(currently line 667) with a 60ms `transition-delay` stagger by `nth-child`, so
tiles arrive in sequence rather than as a block.

Under `prefers-reduced-motion`, the scale and the stagger drop and tiles are
visible without animating. The grayscale swap stays — it is a colour change, not
motion.

The demos use a slate palette, so the resting grayscale state is a small step
from their real appearance and the hover restores rather than floods.

## 7. Shot pipeline

`scripts/shots.js`, run with `npm run shots`. Dev dependencies: `playwright`,
`sharp`.

1. Read `projects.json`.
2. For each entry, launch headless Chromium at 1280×800, `deviceScaleFactor: 2`.
3. Navigate to `demo`, wait for network idle, then a short settle for fonts.
4. Capture the viewport (not full page — the tile shows the fold).
5. PNG → `sharp` → `assets/projects/<slug>.webp`, 1600px wide, quality 80.

Outputs are committed to the repo. The page then depends on no third party at
runtime: a demo that goes down leaves the tile intact, and seven third-party
embeds never touch the page's load time.

`scripts/` and `node_modules/` are added to `.vercelignore`. This is a local
authoring tool, not part of the deploy.

Re-running is manual and deliberate: when a demo's UI changes, run the script,
review the diff, commit. Stale shots are a maintenance cost accepted in exchange
for load performance and resilience.

## 8. Machine view, SEO, accessibility

- Machine view strips presentation and shows text. Tile titles, blurbs and tags
  are real text in the DOM, so they survive it. The chrome bar hostname is a
  text node too and reads sensibly in the stripped view.
- Every shot gets an `alt` describing the app, not the file
  ("The icp-score scoring interface").
- Images carry explicit `width` and `height` so the grid does not shift as they
  load, and `loading="lazy"` below the first row.
- Page metadata: title, description, canonical, OG and Twitter tags matching the
  pattern in `work/index.html`. OG image reuses the existing site card.
- Focus states are visible on both the title link and the GitHub link; the
  hover treatment also fires on `:focus-within` so keyboard users see it.

## 9. Verification

```bash
node build.js
python3 -m http.server 8747
```

- `/projects/` renders seven tiles, six in the grid, `girth-of-nations` below the
  divider.
- Every demo link opens the right app; no 404s.
- Every GitHub link opens the right repo.
- Tab order: title link, then GitHub link, per tile. Hover treatment appears on
  keyboard focus.
- 375px wide: single column, nothing overflows, six-item nav does not break.
- Reduced motion on: tiles visible, no scale, no stagger.
- Machine view: all seven projects readable as text.
- `sitemap.xml` contains `/projects/`.
- Lighthouse: no layout shift from the images.

## 10. Open content items

These block the page's copy, not its structure:

- `why-now` has no repo description. Its blurb has to be written from scratch.
- `icp-score`'s description ends "Day 001 of 100". Decide whether the page
  acknowledges the build-in-public series or the blurbs stand on their own.
- All seven blurbs need Akshat's edit pass before ship. Drafts come from the
  READMEs.
