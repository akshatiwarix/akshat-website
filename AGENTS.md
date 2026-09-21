# Akshat Tiwari's website

Use this file as the working map for this repository. Read the referenced source
of truth before changing content, design, or generated files.

## What this is

- A mostly hand-written, dependency-light static personal portfolio at
  `https://www.akshatiwari.com`.
- The positioning is **GTM Engineer**. It is a calm, clarity-first portfolio for
  recruiters, founders, peers, and general visitors; it is not a hard-sell
  landing page.
- Vercel hosts static pages and the `api/` serverless functions. `main` is the
  production branch and is connected to the live deployment.

## Read before writing

| Need | Source of truth |
| --- | --- |
| Allowed biographical and professional claims | `CONTEXT.md` |
| Approved page copy and information architecture | `COPY.md` |
| Visual language, accessibility, and motion decisions | `DESIGN.md` |
| Blog authoring and supported Markdown | `WRITING.md` |
| Public proof-of-work requirements | `PROOF-OF-WORK.md` |
| Blog and projects generation behavior | `build.js` |
| Comments and likes contract | `docs/superpowers/specs/2026-08-17-blog-comments-and-likes-design.md` |

Do not invent facts, metrics, employer/customer details, account lists, prompts,
or ICP internals. Say what a system does before naming its tools. Do not add the
cut tools listed in `CONTEXT.md`/`PROOF-OF-WORK.md` back into site copy.

## File ownership and build pipeline

### Hand-authored pages

- `index.html` outside `<!-- BLOG:LATEST:START -->` and
  `<!-- BLOG:LATEST:END -->`
- `work/index.html`, `beyond-work/index.html`, and `contact/index.html`
- `styles.css`, `site.js`, `machine-view.js`, and `comments.js`

The four hand-authored pages repeat the page shell (head, header, footer, and
machine-view switch). When a shared-shell change is intentional, update every
hand-authored page **and** the shell in `build.js` so generated pages stay
consistent.

### Generated output: never edit it directly

`node build.js` owns:

- `blog/<slug>/index.html`
- `blog/index.html`
- `blog/feed.xml`
- `sitemap.xml` and `robots.txt`
- the latest-three-post block between the homepage blog markers
- `projects/index.html` only when `SHOW_PROJECTS` in `build.js` is `true`

For a blog-content change, edit `posts/<slug>.md`. For renderer, SEO, shell, or
index behavior, edit `build.js`. For project content, edit `projects.json`;
use `npm run shots` to refresh committed project screenshots when appropriate.
Then run `node build.js` and commit the generated diff. Published post slugs are
permanent URLs: do not rename one without an explicit redirect plan.

`SHOW_PROJECTS` is currently `false`. Do not unhide the projects page only in
one place: enable it in `build.js`, restore the matching nav links in every
hand-authored page, rebuild, and verify the sitemap and `/projects/`.

## Blog conventions

- Front matter requires `title`, `date` (`YYYY-MM-DD`), and a one-sentence
  `excerpt`; `github`, `draft`, and `slug` are optional.
- The title becomes the only `h1`; posts start at `##`.
- Supported Markdown is intentionally limited: headings, paragraphs, flat
  lists, links/images, code fences, quotes, tables, rules, `@youtube(ID)`, and
  raw HTML blocks. See `WRITING.md` before using a new construct.
- Each post page includes likes and comments. A local static preview renders
  the UI but cannot serve the Vercel API, so unavailable-interaction messaging
  is expected locally.

## Client and API constraints

- `site.js` owns theme persistence, clocks, decorative interaction, and
  scroll-reveal behavior. Respect `prefers-reduced-motion` and keep content
  visible when JavaScript or `IntersectionObserver` is unavailable.
- `machine-view.js` derives a text-only reading view from the live DOM. Keep
  navigation/chrome and reader comments out of it; do not add static duplicate
  copy for this view.
- `comments.js` must render user-generated content with DOM APIs and
  `textContent`, never `innerHTML`.
- `api/` is CommonJS plus Node built-ins/global `fetch`; do not introduce an
  npm dependency to deployed server code. `_lib.js` is pure and covered by
  `_lib.test.js`; keep I/O in `_upstash.js` and `_notify.js`.
- Comments and likes require Upstash Redis environment variables. Comments can
  optionally send notification email through Resend. Never print, commit, or
  expose their credentials, `ADMIN_TOKEN`, or `IP_SALT`.

## Design rules

- Use the CSS custom properties in `styles.css`: no hard-coded colours in new
  UI. The visual system is black, grey, mist, and paper; Raleway is display
  type and Roboto is body type.
- No shadows. Buttons can be pills; other surfaces use sharp corners and
  hairline borders.
- Preserve dark mode, keyboard focus, semantic HTML, concise alt text, and
  the reduced-motion path. Do not add stock imagery or a component's demo copy.
  Third-party components are structural donors only: use the site’s content
  and design tokens instead.

## Useful verification

```bash
node build.js
node --test api/_lib.test.js
git diff --check
python3 -m http.server 8899
```

Use the local server for static visual review. Verify changed pages in light and
dark mode, at a narrow mobile width, with reduced motion, and with machine view
when the change affects visible content. The interaction API needs a Vercel
preview or production deployment for an end-to-end check.

## Delivery

- Keep commits narrowly scoped and stage named files, not `git add -A`.
- Pushes to `main` deploy the committed static output to production through
  Vercel. Build locally first because `.vercelignore` deliberately excludes
  the authoring/build tooling from the deploy payload.
- `gh` is installed but its saved token was invalid when last checked; normal
  Git authentication to `origin` worked. Re-authenticate with `gh auth login`
  before relying on GitHub CLI actions such as PR management.
