---
title: Example post
date: 2026-08-10
excerpt: A throwaway post that exercises every piece of markdown the build script understands. Delete it once the first real post ships.
github: https://github.com/akshatiwarix
draft: true
---

This post exists to prove the pipeline works end to end. It is marked `draft: true`,
so the build skips it and nothing here reaches the site. Flip that flag to `false`
if you ever want to see the full range of formatting rendered again.

Paragraphs are just lines of text. A blank line starts a new one. Inline formatting
covers **bold**, _italic_, `inline code`, and [links](https://www.ollive.ai/), both
internal and external.

## A second-level heading

Headings run from `##` to `####`. A single `#` is deliberately not supported — the
post title from the front matter is the page's only `h1`.

### A third-level heading

Lists are flat. Bulleted:

- Sourcing the accounts
- Enriching them from public evidence
- Scoring what is left

And numbered:

1. Write the post in markdown
2. Run `node build.js`
3. Commit the generated HTML

> A blockquote is a single paragraph, however many lines you write it across.

Code fences keep their whitespace and are never syntax-highlighted:

```python
def score(account):
    signals = [s for s in account.signals if s.is_public]
    return sum(s.weight for s in signals)
```

Tables need a header row and a divider:

| Stage | What it does |
|---|---|
| Source | Finds candidate companies |
| Enrich | Adds public evidence |
| Score | Ranks against the ICP |

A YouTube embed is its own line:

@youtube(dQw4w9WgXcQ)

Anything the renderer can't express drops to raw HTML, which passes through
untouched until the next blank line:

<p class="muted">This paragraph was written as raw HTML.</p>

Images work the same way as links, with a leading exclamation mark:
`![alt text](/assets/whatever.jpg)`.

---

A row of three dashes is a horizontal rule.
