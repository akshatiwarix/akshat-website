# /projects Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a generated `/projects` page showing seven shipped repos as a two-column grid of tiles, each previewing its live demo with a committed screenshot.

**Architecture:** `projects.json` at the repo root is the single source of truth. `build.js` reads it and writes `/projects/index.html` using the same `head()`/`FOOT` shell every generated page already uses. `scripts/shots.js` reads the same JSON, drives headless Chromium over each demo URL, and writes committed WebP files to `assets/projects/`. No runtime dependency on any third party: the deployed page is static HTML plus local images.

**Tech Stack:** Node (no framework), vanilla CSS in `styles.css`, Playwright + sharp as local-only devDependencies.

**Spec:** `docs/superpowers/specs/2026-08-16-projects-page-design.md`

## Global Constraints

- Colours come only from the existing tokens: `--color-ink`, `--color-gray`, `--color-mist`, `--color-paper`. No new hue, no hard-coded hex.
- Fonts: `--font-display` (Raleway) for the tile title only; `--font-body` (Roboto) everywhere else. Never bold a heading.
- No shadows. Tiles are sharp-cornered (0 radius); only tag pills use `--radius-pill`.
- Durations and easings come from tokens: `--duration-hover`, `--duration-material`, `--ease-out`.
- No performance metrics, no employer customer names, no ICP internals anywhere in the copy (`CONTEXT.md`, `PROOF-OF-WORK.md`).
- The tool-stack line stays unique to `/work`. Tile tags describe engineering (TypeScript, Deterministic, No LLM), never GTM SaaS.
- `blog/`, `sitemap.xml`, `robots.txt`, and now `projects/index.html` are generated. Never hand-edit them.
- Page shell in `build.js` is byte-identical to the four hand-written pages. A nav change lands in both places.
- Vercel runs no build command and serves committed HTML. Nothing added here may change that.

---

### Task 1: `projects.json` and the page copy

**Files:**
- Create: `projects.json`
- Modify: `COPY.md` (append a `/projects` section)

**Interfaces:**
- Produces: `projects.json` — an array of objects with keys `slug`, `name`, `blurb`, `tags` (string array), `demo`, `repo`, `shot`, `status`, `day` (optional string), `group` (`"gtm"` or `"aside"`), `alt`. Tasks 2, 3 and 5 all read these exact key names.

- [ ] **Step 1: Read each repo's README opening for an accurate blurb**

```bash
for r in icp-score enrichment-waterfall signal-scout lead-cleaner persona-mapper why-now girth-of-nations; do
  echo "===== $r"
  curl -s "https://raw.githubusercontent.com/akshatiwarix/$r/main/README.md" | head -12
done
```

Take the one-line summary under the title and the "Day NNN of 100" line where present. Do not invent claims the README does not make.

- [ ] **Step 2: Write `projects.json`**

Array order is page order. The six `gtm` entries first, `girth-of-nations` last as `aside`.

```json
[
  {
    "slug": "icp-score",
    "name": "ICP Score",
    "blurb": "Ranks companies against an ideal-customer profile and shows the arithmetic behind every score. Exclusions are hard filters, not heavy negative weights, and a missing field says so instead of quietly scoring as a miss.",
    "tags": ["TypeScript", "Deterministic", "No LLM"],
    "demo": "https://icp-score.vercel.app",
    "repo": "https://github.com/akshatiwarix/icp-score",
    "shot": "/assets/projects/icp-score.webp",
    "alt": "The ICP Score interface: a ranked list of companies with an expanded score breakdown",
    "status": "Live",
    "day": "Day 001",
    "group": "gtm"
  }
]
```

Repeat that object shape for all seven. Blurbs are two to three sentences, written from the README, no metrics. `day` is omitted entirely where the README has no day number.

- [ ] **Step 3: Validate the JSON parses and every field is present**

```bash
node -e '
const p = require("./projects.json");
const need = ["slug","name","blurb","tags","demo","repo","shot","alt","status","group"];
p.forEach(x => need.forEach(k => { if (!x[k]) throw new Error(x.slug + " missing " + k); }));
console.log(p.length + " projects ok");
'
```

Expected: `7 projects ok`

- [ ] **Step 4: Check every demo and repo URL is live**

```bash
node -e 'require("./projects.json").forEach(p => console.log(p.demo, "\n", p.repo))' \
  | xargs -n1 curl -o /dev/null -s -w "%{http_code} %{url_effective}\n"
```

Expected: `200` for all fourteen URLs. A non-200 means the entry does not ship.

- [ ] **Step 5: Append the page copy to `COPY.md`**

Add a `## /projects` section holding the H1 (`Projects`), the intro paragraph, the "Off the clock" kicker, and all seven blurbs, so the copy file stops being the only surface that does not know the page exists.

- [ ] **Step 6: Commit**

```bash
git add projects.json COPY.md
git commit -m "Add projects.json as the source for the /projects page"
```

---

### Task 2: The screenshot pipeline

**Files:**
- Create: `scripts/shots.js`
- Create: `package.json`
- Create: `assets/projects/*.webp` (generated, committed)
- Modify: `.gitignore`
- Modify: `.vercelignore`

**Interfaces:**
- Consumes: `projects.json` from Task 1 — reads `slug` and `demo`.
- Produces: one file per project at `assets/projects/<slug>.webp`, 1600px wide, matching the `shot` path in the JSON.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "akshat-website",
  "private": true,
  "scripts": {
    "build": "node build.js",
    "shots": "node scripts/shots.js"
  },
  "devDependencies": {
    "playwright": "^1.49.0",
    "sharp": "^0.33.5"
  }
}
```

This file exists only for local authoring. Vercel must never see it — Step 4 handles that.

- [ ] **Step 2: Write `scripts/shots.js`**

```js
// Captures each live demo into assets/projects/<slug>.webp.
//
// Run manually with `npm run shots` when a demo's UI changes. The output is
// committed, so the deployed page never depends on a third party being up.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'projects');
const projects = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects.json'), 'utf8'));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  });

  for (const project of projects) {
    process.stdout.write(project.slug + ' … ');
    await page.goto(project.demo, { waitUntil: 'networkidle', timeout: 45000 });
    // Fonts and first paint settle after network idle; without this the
    // capture can catch a frame of fallback type.
    await page.waitForTimeout(1500);
    const png = await page.screenshot();
    const file = path.join(OUT, project.slug + '.webp');
    await sharp(png).resize({ width: 1600 }).webp({ quality: 80 }).toFile(file);
    console.log('wrote ' + path.relative(ROOT, file));
  }

  await browser.close();
}

main().catch(function (error) {
  console.error('Shots failed: ' + error.message);
  process.exit(1);
});
```

- [ ] **Step 3: Install and run**

```bash
npm install
npx playwright install chromium
npm run shots
```

Expected: seven `wrote assets/projects/<slug>.webp` lines. Open two of them and confirm they show the app's real interface, not a loading state or an error page.

- [ ] **Step 4: Keep the tooling out of git noise and out of the deploy**

Add to `.gitignore`:

```
node_modules/
```

Add to `.vercelignore`, under a comment explaining why:

```
# Local authoring tooling. Vercel serves committed HTML and runs no build;
# shipping a package.json would make it try to.
package.json
package-lock.json
node_modules/
scripts/
```

- [ ] **Step 5: Verify the images are real and reasonably sized**

```bash
ls -lh assets/projects/
node -e 'require("./projects.json").forEach(p => {
  const f = "." + p.shot;
  if (!require("fs").existsSync(f)) throw new Error("missing " + f);
}); console.log("all shots present")'
```

Expected: seven files, each well under 400KB, and `all shots present`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/shots.js assets/projects .gitignore .vercelignore
git commit -m "Add the Playwright screenshot pipeline for project previews"
```

---

### Task 3: Render the page in `build.js`

**Files:**
- Modify: `build.js` — `NAV` (line 329), `STATIC_PAGES` (line 682), plus new sections
- Create: `projects/index.html` (generated output)

**Interfaces:**
- Consumes: `projects.json` (Task 1), the shot paths (Task 2).
- Produces: `projects/index.html` with class names `.project-grid`, `.project-tile`, `.project-url`, `.project-shot`, `.project-body`, `.project-name`, `.project-blurb`, `.project-tags`, `.project-meta`, `.project-repo`. Task 4 styles exactly these names.

- [ ] **Step 1: Add the Projects nav item**

In `build.js`, `NAV` becomes:

```js
var NAV = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/work/', label: 'Work', key: 'work' },
  { href: '/projects/', label: 'Projects', key: 'projects' },
  { href: '/blog/', label: 'Blog', key: 'blog' },
  { href: '/beyond-work/', label: 'Beyond Work', key: 'beyond' },
  { href: '/contact/', label: 'Contact', key: 'contact' }
];
```

- [ ] **Step 2: Add `/projects/` to the sitemap**

```js
var STATIC_PAGES = ['/', '/work/', '/projects/', '/blog/', '/beyond-work/', '/contact/'];
```

- [ ] **Step 3: Add the projects reader and renderer**

Place after the blog index section, before "Homepage block". Follows the file's existing style: `var`, function declarations, template literals, a comment block above each section.

```js
// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
//
// projects.json is the source. Every tile previews a live demo with a
// committed screenshot, so a demo going down costs the page nothing.

var PROJECTS_FILE = path.join(ROOT, 'projects.json');

function readProjects() {
  if (!fs.existsSync(PROJECTS_FILE)) return [];

  var projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));

  projects.forEach(function (project) {
    ['slug', 'name', 'blurb', 'demo', 'repo', 'shot', 'alt'].forEach(function (key) {
      if (!project[key]) throw new Error('projects.json: ' + (project.slug || '?') + ' is missing ' + key);
    });
  });

  return projects;
}

// The chrome bar shows where the tile goes, not the full URL with its scheme.
function displayHost(url) {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function projectTile(project) {
  var meta = [project.status, project.day].filter(Boolean).join(' · ');

  return `        <article class="project-tile">
          <p class="project-url">${escapeHtml(displayHost(project.demo))}</p>
          <div class="project-shot">
            <img src="${project.shot}" alt="${escapeHtml(project.alt)}"
                 width="1600" height="1000" loading="lazy" decoding="async">
          </div>
          <div class="project-body">
            <h3 class="project-name"><a href="${project.demo}" target="_blank" rel="noopener">${escapeHtml(project.name)}</a></h3>
            <a class="project-repo" href="${project.repo}" target="_blank" rel="noopener">GitHub</a>
            <p class="project-blurb">${escapeHtml(project.blurb)}</p>
            <ul class="project-tags">
${(project.tags || []).map(function (tag) {
  return '              <li>' + escapeHtml(tag) + '</li>';
}).join('\n')}
            </ul>
            <p class="project-meta">${escapeHtml(meta)}</p>
          </div>
        </article>`;
}

function projectGrid(projects) {
  return `      <div class="project-grid">
${projects.map(projectTile).join('\n')}
      </div>`;
}

function renderProjects(projects) {
  var gtm = projects.filter(function (p) { return p.group !== 'aside'; });
  var aside = projects.filter(function (p) { return p.group === 'aside'; });

  return head({
    title: SITE.projectsTitle,
    ogTitle: SITE.projectsTitle,
    description: SITE.projectsDescription,
    path: '/projects/',
    nav: 'projects'
  }) + `
<main>
  <section class="page-head container reveal sky">
    <div class="prose">
      <h1 class="page-title">Projects</h1>
      <p>${SITE.projectsIntro}</p>
    </div>
  </section>

  <div class="sheet">
  <section class="section container" data-reveal>
    <div class="section-head">
      <p class="kicker">Shipped</p>
      <h2>GTM systems</h2>
    </div>
${projectGrid(gtm)}
  </section>
${aside.length ? `
  <section class="section container" data-reveal>
    <div class="section-head">
      <p class="kicker">Off the clock</p>
      <h2>Not GTM</h2>
    </div>
${projectGrid(aside)}
  </section>` : ''}
  </div>
</main>
` + FOOT;
}
```

- [ ] **Step 4: Add the page's strings to `SITE`**

In the `SITE` object near line 31:

```js
projectsTitle: 'Projects — Akshat Tiwari, GTM Engineer',
projectsDescription: 'Deployed GTM tools: ICP scoring, enrichment waterfalls, record linkage, buying-committee mapping, signal monitoring. Every one is live and clickable.',
projectsIntro: 'Every one of these is deployed and clickable. Open a tile, use the thing, then read the code — no clone, no setup, no talking to me first.',
```

Edit the intro wording to Akshat's voice; keep it one sentence or two.

- [ ] **Step 5: Write the page from `main()`**

In `main()`, after the blog writes:

```js
  var projects = readProjects();
  if (projects.length) {
    write(path.join('projects', 'index.html'), renderProjects(projects));
  }
```

- [ ] **Step 6: Build and verify the output**

```bash
node build.js
```

Expected: `Wrote:` lists `projects/index.html` and `sitemap.xml`.

```bash
grep -c 'class="project-tile"' projects/index.html   # expect 7
grep -c 'href="/projects/"' projects/index.html      # expect 1 (the nav item)
grep -o '<loc>[^<]*projects[^<]*</loc>' sitemap.xml  # expect the /projects/ URL
node -e 'const h=require("fs").readFileSync("projects/index.html","utf8");
  if (h.includes("<a", h.indexOf("project-name")) && /<a[^>]*>[^<]*<a/.test(h)) throw new Error("nested anchor");
  console.log("no nested anchors")'
```

- [ ] **Step 7: Commit**

```bash
git add build.js projects/index.html sitemap.xml
git commit -m "Generate the /projects page from projects.json"
```

---

### Task 4: Tile and grid styles

**Files:**
- Modify: `styles.css` — append a Projects section after the post-row block; extend the stagger selector lists near line 764 and the reduced-motion block near line 1358.

**Interfaces:**
- Consumes: the class names produced in Task 3.

- [ ] **Step 1: Append the Projects section to `styles.css`**

```css
/* ---------- Projects grid ---------- */

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-8);
}

.project-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-mist);
  background: var(--color-paper);
  transition: border-color var(--duration-hover) ease;
}

.project-tile:hover,
.project-tile:focus-within { border-color: var(--color-ink); }

/* The chrome bar: a hairline and an address, so the tile reads as a website
   rather than as a picture. Lowercase, because a URL in caps is not a URL. */
.project-url {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-body);
  font-size: var(--text-kicker);
  letter-spacing: 0.08em;
  color: var(--color-gray);
  border-bottom: 1px solid var(--color-mist);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-shot {
  overflow: hidden;
  aspect-ratio: 16 / 10;
  background: var(--color-mist);
  border-bottom: 1px solid var(--color-mist);
}

.project-shot img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  filter: grayscale(1);
  transition: filter var(--duration-material) ease,
              transform var(--duration-material) var(--ease-out);
}

.project-tile:hover .project-shot img,
.project-tile:focus-within .project-shot img {
  filter: grayscale(0);
  transform: scale(1.03);
}

.project-body {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4) var(--space-4);
}

.project-name {
  margin: 0;
  padding-right: 4.5rem;
  font-family: var(--font-display);
  font-size: var(--text-subheading);
  font-weight: 400;
  letter-spacing: var(--track-subheading);
  line-height: 1.25;
}

.project-name a { color: var(--color-ink); text-decoration: none; }

/* Stretched link: the whole tile opens the demo, while the GitHub link stays a
   separate anchor. Nesting one anchor in another would be invalid and would
   break tab order. */
.project-name a::after { content: ""; position: absolute; inset: 0; z-index: 1; }

.project-repo {
  position: absolute;
  top: var(--space-6);
  right: var(--space-4);
  z-index: 2;
  font-size: var(--text-caption);
  letter-spacing: var(--track-small);
  color: var(--color-gray);
  text-decoration: none;
  border-bottom: 1px solid var(--color-mist);
  transition: color var(--duration-hover) ease, border-color var(--duration-hover) ease;
}

.project-repo:hover { color: var(--color-ink); border-bottom-color: var(--color-ink); }

.project-blurb {
  margin: 0;
  font-size: var(--text-body-sm);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.project-tags li {
  padding: 0.125rem var(--space-3);
  font-size: var(--text-caption);
  letter-spacing: var(--track-small);
  color: var(--color-gray);
  border: 1px solid var(--color-mist);
  border-radius: var(--radius-pill);
}

.project-meta {
  margin: auto 0 0;
  font-size: var(--text-caption);
  letter-spacing: var(--track-small);
  color: var(--color-gray);
}
```

- [ ] **Step 2: Add tiles to the existing reveal stagger**

Add `.project-tile` to each `:is(...)` list in the four rules at lines ~750–769, so tiles inherit the same 60ms cascade the def-rows use:

```css
.js [data-reveal] .link-row,
.js [data-reveal] .def-row,
.js [data-reveal] .dir-row,
.js [data-reveal] .specimen,
.js [data-reveal] .project-tile { ... }
```

and in each `nth-child` delay rule: `:is(.link-row, .def-row, .dir-row, .specimen, .project-tile)`.

- [ ] **Step 3: Add the responsive and reduced-motion rules**

Single column below 700px, in the file's existing mobile media query:

```css
@media (max-width: 43.75rem) {
  .project-grid { grid-template-columns: 1fr; gap: var(--space-6); }
}
```

In the `prefers-reduced-motion: reduce` block near line 1358, alongside the existing stagger reset:

```css
  .project-shot img { transition: filter var(--duration-hover) ease; transform: none; }
  .project-tile:hover .project-shot img,
  .project-tile:focus-within .project-shot img { transform: none; }
```

The grayscale swap survives: it is a colour change, not motion.

- [ ] **Step 4: Look at the page**

```bash
python3 -m http.server 8747
```

Open `http://localhost:8747/projects/` and check, in this order:

1. Two columns, equal-height tiles, nothing overflowing.
2. Tiles are grey at rest; hovering one restores colour, lifts the border to ink, and eases the image up 3%.
3. Tab through: the title link focuses first, then GitHub, and the tile shows its hover state on focus.
4. At 375px: one column, the six-item nav still fits, no horizontal scroll.
5. Dark mode via the theme toggle: borders and text invert, screenshots still read.
6. Reduced motion on: tiles are visible, nothing scales, nothing staggers.

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "Style the projects grid: hairline chrome, grayscale previews, ink hover"
```

---

### Task 5: Nav, cross-link, and machine view

**Files:**
- Modify: `index.html`, `work/index.html`, `beyond-work/index.html`, `contact/index.html` — nav
- Modify: `work/index.html` — one line linking to `/projects`
- Modify: `machine-view.js:47` — `CONTENT` selector

- [ ] **Step 1: Add the nav item to all four hand-written pages**

In each page's `<nav class="site-nav">`, between the Work and Blog links:

```html
        <a href="/projects/">Projects</a>
```

On `work/index.html` the Work link keeps `aria-current="page"`; on the others nothing else changes. The markup must match what `build.js` emits exactly — same indentation, same order — because the two shells are the same document.

- [ ] **Step 2: Verify the shells still agree**

```bash
node build.js
node -e '
const fs = require("fs");
const nav = h => h.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0].replace(/ aria-current="page"/g, "");
const pages = ["index.html","work/index.html","beyond-work/index.html","contact/index.html","blog/index.html","projects/index.html"];
const first = nav(fs.readFileSync(pages[0], "utf8"));
pages.forEach(p => { if (nav(fs.readFileSync(p, "utf8")) !== first) throw new Error("nav differs in " + p); });
console.log("nav identical across " + pages.length + " pages");
'
```

Expected: `nav identical across 6 pages`

- [ ] **Step 3: Point `/work` at the new page**

In `work/index.html`, directly above the `stack-note` section, add a line inside the existing sheet:

```html
  <section class="section container" data-reveal>
    <div class="section-head">
      <p class="kicker">Proof</p>
      <h2>Things you can open</h2>
    </div>
    <div class="prose">
      <p>The tools above are described; these are deployed. Seven small GTM systems, each one live in the browser with its source on GitHub.</p>
    </div>
    <div class="hero-actions">
      <a class="btn" href="/projects/">See the projects</a>
    </div>
  </section>
```

Leave the commented-out Proof of work placeholder exactly where it is — it waits on the dataset artifact, which is separate.

- [ ] **Step 4: Teach machine view to read the tiles**

`machine-view.js` already reads `h3` and `p`, which covers the title, blurb and meta. The tags are `li`, also covered. Add the chrome-bar address so the stripped view keeps the URL:

```js
  var CONTENT = 'h1, h2, h3, h4, p, li, pre, th, td, .channel, ' +
                '.link-row .title, .link-row .note, ' +
                '.post-row-date, .post-row-title, .post-row-excerpt';
```

is already sufficient — `.project-url` is a `p`. Confirm rather than edit:

```bash
grep -n 'class="project-url"' projects/index.html | head -1
```

Expected: the element is a `<p>`. If it is not, add `.project-url` to `CONTENT`.

- [ ] **Step 5: Verify machine view**

With the local server running, open `/projects/`, switch machine view on, and confirm all seven projects appear as text — name, address, blurb, tags, status — in reading order.

- [ ] **Step 6: Commit**

```bash
git add index.html work/index.html beyond-work/index.html contact/index.html blog projects sitemap.xml
git commit -m "Add Projects to the nav and link it from /work"
```

---

### Task 6: Full verification and push

**Files:** none modified — this task proves the work.

- [ ] **Step 1: Clean rebuild produces no diff**

```bash
node build.js && git status --porcelain
```

Expected: `Nothing changed.` and empty status. A second build that rewrites files means the renderer is not deterministic.

- [ ] **Step 2: Link check across the built page**

```bash
node -e 'const h=require("fs").readFileSync("projects/index.html","utf8");
  const urls=[...h.matchAll(/href="(https?:[^"]+)"/g)].map(m=>m[1]);
  console.log([...new Set(urls)].join("\n"))' \
  | xargs -n1 curl -o /dev/null -s -w "%{http_code} %{url_effective}\n"
```

Expected: `200` for every demo and repo URL.

- [ ] **Step 3: Browser pass**

Using the `/browse` skill against `http://localhost:8747/projects/`, capture and check: desktop light, desktop dark, 375px, and one hover state. Confirm no layout shift as images load and no console errors.

- [ ] **Step 4: Push the branch**

```bash
git push -u origin HEAD
```

- [ ] **Step 5: Confirm the deploy did not change shape**

In the Vercel deployment log for the pushed branch, confirm it is still a static deploy with no install or build step. If Vercel picked up `package.json` despite `.vercelignore`, the fix is to set the project's framework preset to "Other" with an empty build command — the site's HTML is committed and must never be rebuilt in CI.

- [ ] **Step 6: Report the preview URL**

Hand Akshat the preview URL for `/projects/` so he can review the real thing.

---

## Self-Review

**Spec coverage:** §2 scope → Task 1. §3 route/shell/nav → Tasks 3 and 5. §4 data model → Task 1. §5 tile anatomy → Tasks 3 and 4. §6 motion → Task 4. §7 shot pipeline → Task 2. §8 machine view, SEO, a11y → Tasks 3 and 5. §9 verification → Tasks 4 and 6. §10 open content items → Task 1 Steps 1 and 5, plus the `day` field carrying the 100-day series.

**Type consistency:** the JSON keys defined in Task 1 (`slug`, `name`, `blurb`, `tags`, `demo`, `repo`, `shot`, `alt`, `status`, `day`, `group`) are the only keys read in Tasks 2 and 3. The class names emitted in Task 3 are exactly the ones styled in Task 4.

**Known risk:** adding `package.json` to a repo Vercel currently treats as static could trigger framework detection. Task 2 Step 4 excludes it from the deploy and Task 6 Step 5 verifies the deploy shape before this is called done.
