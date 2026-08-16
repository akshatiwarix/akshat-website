# Blog comments and likes — design

**Date:** 2026-08-17
**Status:** approved, ready for implementation planning

Add a like button and an anonymous, threaded comment section to every blog post,
without giving up the thing that makes this site cheap to run: Vercel serves
committed HTML and runs no build command.

---

## Goals

- Anyone can comment. No account, no login, no GitHub.
- Anyone can reply to a comment, including Akshat, whose replies are badged.
- Comments appear instantly and email Akshat so he can delete junk quickly.
- One like per browser, per post.
- The markup is ours, so it inherits `DESIGN.md` exactly. No iframe widget.
- No npm dependency reaches the deployed site. `.vercelignore` keeps
  `package.json` out of the deploy on purpose, and this feature does not
  reverse that decision.

## Non-goals

- Login, identity, or verified authorship for commenters. A name is a string
  someone typed; the design assumes it and never implies otherwise.
- Nesting deeper than one level. A reply to a reply attaches to the same
  top-level parent.
- Pre-publication moderation. Comments go live on submit.
- Comments in the HTML source. They render client-side and are not indexed.
- Editing a comment after posting. Delete and repost.
- Per-person like accuracy. Without login it is not achievable; localStorage
  plus IP rate limiting is the honest ceiling.

---

## Architecture

```
browser                    Vercel Functions            Upstash Redis
────────                   ─────────────────           ─────────────
comments.js  ──GET────▶    api/comments.js   ──REST──▶  post:<slug>:comments
             ──POST───▶                      ──REST──▶  rl:<ip-hash>
             ──DELETE─▶                          │
                                                 └────▶  Resend (email)
             ──GET────▶    api/likes.js      ──REST──▶  post:<slug>:likes
             ──POST───▶
```

The functions are CommonJS (`module.exports = async (req, res) => {}`). With
`package.json` excluded from the deploy there is no `"type": "module"`, so ESM
would not load. They reach Upstash and Resend with `fetch`, which Node provides
natively — no client library, no build step, no `vercel.json`.

`api/` is not listed in `.vercelignore`, so zero-config picks the functions up.

---

## Data model

Three key patterns in Redis:

| Key | Type | Contents |
|---|---|---|
| `post:<slug>:likes` | integer | Like count. `INCR` on POST, `GET` to read. |
| `post:<slug>:comments` | list | One JSON-encoded comment per element, append order. |
| `rl:<ip-hash>` | integer | Requests in the current window. 600s TTL. |

A stored comment:

```json
{
  "id": "k3f9a2c1",
  "parentId": null,
  "name": "Jordan",
  "body": "Comment text as typed.",
  "ts": 1755388800000,
  "author": false
}
```

`id` is a random 8-character base36 string generated server-side. `parentId` is
`null` for a top-level comment or the `id` of the comment being answered.
`author` is true only for comments posted with a valid admin token.

Deletion rewrites the list without the removed element. Deleting a top-level
comment also deletes every comment whose `parentId` matches it.

Nothing is stored that identifies a commenter: no email, no raw IP. The rate
limiter stores a salted hash of the IP and lets it expire.

---

## HTTP API

### `GET /api/comments?slug=<slug>`

Returns the assembled thread.

```json
{
  "comments": [
    { "id": "...", "name": "...", "body": "...", "ts": 0, "author": false,
      "replies": [ { "id": "...", "name": "...", "body": "...", "ts": 0, "author": true } ] }
  ]
}
```

Top-level comments newest first; replies oldest first within a parent. A reply
whose parent no longer exists is dropped from the response.

`400` if `slug` is missing or not a known post slug shape (`[a-z0-9-]{1,80}`).

### `POST /api/comments`

Body: `{ slug, name, body, parentId, hp, token }`.

Validation, in order, first failure wins:

| Rule | Failure |
|---|---|
| `slug` matches `[a-z0-9-]{1,80}` | `400` |
| `hp` (honeypot) is empty or absent | `400`, generic message |
| `name` trimmed, 1–60 chars | `400` |
| `body` trimmed, 1–2000 chars | `400` |
| `parentId` absent, or an existing top-level comment's id | `400` |
| Rate limit: 3 POSTs per 600s per IP hash | `429` |
| Thread cap: 500 comments per slug | `409` |

A valid `token` (equal to `ADMIN_TOKEN`) sets `author: true` and skips the rate
limit. An invalid token is treated as no token, not as an error — a wrong guess
posts an ordinary comment rather than revealing that the token was wrong.

If `parentId` names a comment that is itself a reply, the new comment attaches
to that reply's parent. This is what enforces one-level nesting server-side;
the UI never offers a deeper reply, but the API cannot rely on the UI.

On success: `201` with the created comment, and a notification email is sent.
**Email failure never fails the request** — the comment is already stored, and
losing a notification is not worth showing the reader an error. The failure is
logged.

### `DELETE /api/comments`

Body: `{ slug, id, token }`. Requires a valid `ADMIN_TOKEN`; `401` otherwise.
Removes the comment and, if it was top-level, its replies. `204` on success,
also on an id that is already gone.

### `GET /api/likes?slug=<slug>` → `{ "likes": 12 }`

### `POST /api/likes`

Body: `{ slug }`. `INCR` and return the new count. Rate limited to 10 per 600s
per IP hash to blunt scripted inflation. The one-per-browser rule is enforced
client-side in localStorage; the server does not pretend to guarantee it.

---

## Email notification

One `fetch` to Resend's REST API per new comment, sent to Akshat: post title,
commenter name, body, and a link to the comment. Sent from Resend's sandbox
sender, which requires no domain verification because the recipient is the
account owner. Verifying `akshatiwari.com` later changes only the `from` field.

Skipped silently when `RESEND_API_KEY` is unset, so local and preview
environments work without it.

---

## Front end

### Files

| File | Role |
|---|---|
| `api/_lib.js` | Pure helpers: validation, id generation, IP hashing, thread assembly, one-level reparenting. No I/O, so it is unit-testable. |
| `api/comments.js` | GET / POST / DELETE handler. |
| `api/likes.js` | GET / POST handler. |
| `comments.js` | Root-level static script, sibling of `site.js` and `machine-view.js`. Fetches and renders. |

### Edits to existing files

- `build.js` — `renderPost` emits the engagement section between the post body
  and the "All posts" link, and appends `<script src="/comments.js" defer>`
  **on post pages only**. The shared page shell is untouched, so it stays
  byte-identical to the four hand-written pages and CLAUDE.md's
  change-it-in-both-places rule does not apply.
- `machine-view.js` — `.comments` joins `NOT_CONTENT`. Machine view is the words
  on the page as written; its `CONTENT` selector would otherwise read every
  visitor's `<p>` into the readout.
- `styles.css` — one new block for the section.

### Rendering

The committed HTML contains the like button, the form, and an empty thread
container. `comments.js` fetches on load and fills it.

Every piece of user-supplied text is written with `textContent`. `innerHTML` is
never used with any value that came from the API. This is the feature's main
XSS surface and the rule is absolute.

State handled explicitly: loading, empty ("No comments yet"), failed fetch
(a retry line, not a silent blank), posting (button disabled), and post failure
(the message stays in the textarea so nothing typed is lost).

### Admin mode

Visiting any post with `?admin=<token>` stores the token in localStorage and
strips the query string. From then on this browser posts with `author: true`
and shows a delete control on every comment. `?admin=` with an empty value
clears it.

### Layout

```
♡ 12                                    pill; fills black once liked

COMMENTS · 4                            kicker, 12px, uppercase, 0.14em

Name  [                    ]
      [ your comment       ]            sharp corners, 1px #e6e6e6
                       ( Post )         pill

────────────────────────────────
Jordan · 2 days ago                     name ink, time gray
Body text.
                          Reply
    │ Akshat  AUTHOR · 1 day ago        one indent, 1px left rule
    │ The reply.
```

Tokens only: `#000000`, `#808080`, `#e6e6e6`, `#ffffff`. Every string in this
block is Roboto, including the kicker labels — the section has no display
heading, so Raleway does not appear in it at all. No shadows. Pills for the two
buttons, sharp corners for the inputs and every divider.

---

## Environment variables

| Name | Set by | Missing behaviour |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Vercel Marketplace integration | Endpoints return `503`; page shows the failure state |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel Marketplace integration | as above |
| `RESEND_API_KEY` | manual | Email skipped, comment still saved |
| `NOTIFY_EMAIL` | manual | Falls back to `pi4akshat@gmail.com`. Must match the Resend account while the sandbox sender is in use |
| `ADMIN_TOKEN` | manual, random string | Author badge and delete unavailable |
| `IP_SALT` | manual, random string | Falls back to a constant; rate limiting still works |

---

## Testing

The repo has no test runner and this feature does not add one. `node --test` is
built into Node.

- `api/_lib.test.js` covers `api/_lib.js`: length and emptiness rules, honeypot
  rejection, slug shape, id shape, thread assembly ordering, orphaned-reply
  removal, and reparenting a reply-to-a-reply onto its top-level ancestor.
- The handlers are verified against a real Vercel preview deployment, the only
  place Upstash and Resend exist. Checklist: post a comment, reply to it, reply
  to that reply and confirm it lands one level deep, like once and confirm the
  reload keeps it filled, delete with the token, confirm a second like from the
  same browser is refused, confirm the email arrived.

## Rollout

1. Akshat adds the Upstash integration and sets `RESEND_API_KEY`, `ADMIN_TOKEN`,
   `IP_SALT` in the Vercel dashboard.
2. Merge to `main`. Every post gets the section automatically — it is keyed by
   slug and nothing is per-post.

## Risks

- **Spam lands on a live page.** Accepted deliberately: instant posting was
  chosen over held-for-approval. The honeypot, rate limit and email notification
  are the mitigation, and deletion is one click from the post itself.
- **Upstash free tier exhaustion** would break the section, not the site: the
  post still renders, the section shows its failure state.
- **Comments are invisible to crawlers and with JS off.** The cost of not
  rebuilding the site on every comment.
