# WRITING.md

How to publish a post. Two commands and a commit.

---

## The loop

1. Write `posts/my-post-slug.md` (the filename becomes the URL).
2. Run `node build.js`.
3. Commit everything it wrote, push. Vercel serves the files as-is.

```bash
node build.js
git add -A && git commit -m "post: my post title" && git push
```

The URL is `/blog/my-post-slug/`. Keep slugs short, lowercase, hyphenated, and
never change one after it's published — that's a dead link for anyone who shared it.

---

## Front matter

Every post starts with this block:

```markdown
---
title: What I learned building an ICP scorer
date: 2026-08-14
excerpt: One sentence that shows up under the title on the blog index, in the RSS feed, and as the page's meta description in Google.
github: https://github.com/akshatiwarix/icp-scorer
draft: false
---
```

| Field | Required | What it does |
|---|---|---|
| `title` | yes | The `h1`, the page title, the RSS item title |
| `date` | yes | `YYYY-MM-DD`. Sorts the index and groups it by year |
| `excerpt` | yes | One sentence, doing three jobs at once. Write it last |
| `github` | no | Puts a "See the code on GitHub" button under the title |
| `draft` | no | `true` keeps the post out of the build entirely |
| `slug` | no | Overrides the filename as the URL |

The excerpt is the highest-leverage line in the file: it's what someone reads on
the index deciding whether to click, and what Google shows under your title.
Write it as a sentence, not a summary fragment.

---

## What markdown supports

Everything the site needs and nothing it doesn't:

- `##`, `###`, `####` headings. A single `#` is not supported — the title from
  the front matter is the page's only `h1`.
- Paragraphs, `**bold**`, `_italic_`, `` `inline code` ``, `[links](url)`.
- Flat bulleted (`- `) and numbered (`1. `) lists. No nesting.
- ` ```lang ` fenced code blocks. Never syntax-highlighted, by design.
- `> ` blockquotes.
- Tables with a header row and a `|---|` divider.
- `---` on its own line for a horizontal rule.
- `![alt](/assets/image.jpg)` images — put the file in `assets/`.
- `@youtube(VIDEO_ID)` on its own line for an embed.

Anything else: write raw HTML. Any block starting with `<` passes through
untouched until the next blank line.

---

## What the build regenerates

Running `node build.js` rewrites all of these, so never hand-edit them:

- `blog/<slug>/index.html` — one per published post
- `blog/index.html` — the index, grouped by year
- `blog/feed.xml` — RSS
- `sitemap.xml`, `robots.txt`
- The latest-three block on the homepage, between the `BLOG:LATEST` markers in
  `index.html`. Everything outside those markers stays hand-written.

Deleting a post's `.md` file, or setting `draft: true`, removes its folder from
`blog/` on the next build. Commit that deletion or the page stays live.

---

## Things worth knowing

**The build only runs on your machine.** Vercel has no build command; it serves
the committed HTML. If `build.js` breaks, the live site doesn't notice. The cost
is that a post isn't live until you've run the build and committed its output.

**Analytics.** Every page loads `/_vercel/insights/script.js`. It 404s locally —
that's expected. It needs Web Analytics switched on once in the Vercel dashboard
under the project's Analytics tab.

**Preview before you publish.** `python3 -m http.server 8899` from the repo root,
then open `http://localhost:8899/blog/`. Opening the HTML file directly also works,
but root-relative paths like `/styles.css` won't resolve.

**Deferred on purpose**, to be added when volume justifies it: prev/next links,
pagination, per-post OG images, category pages, a projects index.
