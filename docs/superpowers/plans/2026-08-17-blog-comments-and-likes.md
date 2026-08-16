# Blog Comments and Likes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every blog post a like button and an anonymous, one-level-threaded comment section that posts instantly and emails Akshat.

**Architecture:** Three zero-dependency Vercel serverless functions in `api/` talk to Upstash Redis over its HTTP REST API with `fetch`. The post page ships an empty container; a root-level `comments.js` fetches and renders into it. Pure logic lives in `api/_lib.js` so it can be unit-tested without a network.

**Tech Stack:** Node 26 (CommonJS), Vercel zero-config functions, Upstash Redis REST, Resend REST, `node --test`. No npm dependencies.

**Spec:** [docs/superpowers/specs/2026-08-17-blog-comments-and-likes-design.md](../specs/2026-08-17-blog-comments-and-likes-design.md)

## Global Constraints

- **No npm dependency may reach the deployed site.** `.vercelignore` excludes `package.json` deliberately. Everything in `api/` uses only Node built-ins and global `fetch`.
- **CommonJS only** in `api/`. Without a deployed `package.json` there is no `"type": "module"`, so `import` will not load. Use `require` and `module.exports`.
- **Colours come from CSS custom properties**, never hex literals. The site has a dark theme that swaps `--color-ink`/`--color-paper`; a hardcoded `#000` inverts wrong. Tokens: `--color-ink`, `--color-gray`, `--color-mist`, `--color-paper`, `--color-tint-hover`, `--color-tint-press`.
- **Fonts:** `var(--font-body)` (Roboto) throughout this feature. No Raleway — the section has no display heading.
- **No shadows. Pills (`9999px`) for buttons, sharp corners for everything else.**
- **User text is written with `textContent`, never `innerHTML`.** This is the feature's XSS surface and the rule has no exceptions.
- **Limits, verbatim from the spec:** slug `^[a-z0-9-]{1,80}$`, name 1–60 chars, body 1–2000 chars, 3 comments per 600s per IP hash, 10 likes per 600s per IP hash, 500 comments per post.
- **`build.js` output is generated.** Never hand-edit `blog/`, `sitemap.xml`, or the `BLOG:LATEST` block in `index.html`. Change `build.js` and re-run `node build.js`.

**One refinement to the spec's file list:** the spec named `api/_lib.js`, `api/comments.js`, `api/likes.js`. This plan adds two more `_`-prefixed helper modules — `api/_upstash.js` (Redis I/O) and `api/_notify.js` (Resend I/O) — so that `_lib.js` stays pure and unit-testable, which is what the spec asked for. Same design, one more seam.

---

## File Structure

| File | Responsibility |
|---|---|
| `api/_lib.js` | Pure functions: slug/name/body validation, honeypot, id generation, IP hashing, parent resolution, thread assembly, deletion. No I/O, no `process.env` reads at call time. |
| `api/_lib.test.js` | `node --test` unit tests for the above. |
| `api/_upstash.js` | The only file that talks to Redis. Exposes `configured()`, `listGet`, `listAppend`, `listReplace`, `counterGet`, `counterIncrement`, `rateLimit`. |
| `api/_notify.js` | The only file that talks to Resend. Exposes `commentPosted()`. Never throws. |
| `api/comments.js` | HTTP handler: `GET`, `POST`, `DELETE`. Orchestrates `_lib` + `_upstash` + `_notify`. |
| `api/likes.js` | HTTP handler: `GET`, `POST`. |
| `comments.js` | Browser script. Fetch, render, submit, reply, delete, like. Sibling of `site.js`. |
| `build.js` | Modified: `renderPost` emits the section and the script tag. |
| `machine-view.js` | Modified: `.comments` added to `NOT_CONTENT`. |
| `styles.css` | Modified: one new block, plus two additions to existing shared rules. |

---

### Task 1: Pure logic and its tests

Everything with a rule in it, in one file with no network. This is the only task with real unit tests; later tasks are verified against a preview deployment because Upstash and Resend do not exist locally.

**Files:**
- Create: `api/_lib.js`
- Test: `api/_lib.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, all used by Tasks 3 and 4:
  - `isValidSlug(slug) -> boolean`
  - `newId(randomBytes?) -> string` (8 chars, `[a-z0-9]`)
  - `hashIp(ip, salt) -> string` (16 hex chars)
  - `validateComment(input) -> { ok: true, value: { slug, name, body, parentId } } | { ok: false, status: number, error: string }`
  - `resolveParent(parentId, comments) -> { ok: true, parentId: string|null } | { ok: false }`
  - `buildThread(comments) -> Array<Comment & { replies: Comment[] }>`
  - `withoutComment(comments, id) -> Comment[]`
  - Constants: `NAME_MAX = 60`, `BODY_MAX = 2000`, `THREAD_MAX = 500`, `RATE_WINDOW = 600`, `COMMENT_RATE = 3`, `LIKE_RATE = 10`

- [ ] **Step 1: Write the failing tests**

Create `api/_lib.test.js`:

```js
'use strict';

var test = require('node:test');
var assert = require('node:assert');
var lib = require('./_lib.js');

test('isValidSlug accepts a real slug and rejects junk', function () {
  assert.equal(lib.isValidSlug('the-creator-economy-is-a-recursive-loop'), true);
  assert.equal(lib.isValidSlug('Post'), false);
  assert.equal(lib.isValidSlug('a/b'), false);
  assert.equal(lib.isValidSlug(''), false);
  assert.equal(lib.isValidSlug(undefined), false);
  assert.equal(lib.isValidSlug('x'.repeat(81)), false);
});

test('newId is eight lowercase alphanumerics', function () {
  var id = lib.newId();
  assert.match(id, /^[a-z0-9]{8}$/);
});

test('newId is deterministic given its bytes', function () {
  var bytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]);
  var a = lib.newId(function () { return bytes; });
  var b = lib.newId(function () { return bytes; });
  assert.equal(a, b);
  assert.equal(a, '01234567');
});

test('hashIp is stable, salted, and not the address', function () {
  var a = lib.hashIp('203.0.113.5', 'salt');
  assert.equal(a, lib.hashIp('203.0.113.5', 'salt'));
  assert.notEqual(a, lib.hashIp('203.0.113.5', 'other-salt'));
  assert.notEqual(a, lib.hashIp('203.0.113.6', 'salt'));
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.equal(a.indexOf('203'), -1);
});

test('validateComment accepts a good comment and trims it', function () {
  var out = lib.validateComment({ slug: 'a-post', name: '  Jordan ', body: ' Hello.\n' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.value, { slug: 'a-post', name: 'Jordan', body: 'Hello.', parentId: null });
});

test('validateComment rejects a filled honeypot', function () {
  var out = lib.validateComment({ slug: 'a-post', name: 'Bot', body: 'Buy things', hp: 'http://spam' });
  assert.equal(out.ok, false);
  assert.equal(out.status, 400);
});

test('validateComment enforces the length rules', function () {
  assert.equal(lib.validateComment({ slug: 'a-post', name: '', body: 'x' }).ok, false);
  assert.equal(lib.validateComment({ slug: 'a-post', name: '   ', body: 'x' }).ok, false);
  assert.equal(lib.validateComment({ slug: 'a-post', name: 'x'.repeat(61), body: 'x' }).ok, false);
  assert.equal(lib.validateComment({ slug: 'a-post', name: 'n', body: '' }).ok, false);
  assert.equal(lib.validateComment({ slug: 'a-post', name: 'n', body: 'x'.repeat(2001) }).ok, false);
  assert.equal(lib.validateComment({ slug: 'a-post', name: 'n', body: 'x'.repeat(2000) }).ok, true);
});

test('validateComment strips control characters but keeps newlines', function () {
  var out = lib.validateComment({ slug: 'a-post', name: 'n', body: 'one\u0000two\r\nthree' });
  assert.equal(out.value.body, 'onetwo\nthree');
});

test('validateComment rejects a malformed parentId', function () {
  assert.equal(lib.validateComment({ slug: 'a-post', name: 'n', body: 'b', parentId: 'nope!' }).ok, false);
  assert.equal(lib.validateComment({ slug: 'a-post', name: 'n', body: 'b', parentId: 'abcd1234' }).ok, true);
});

test('resolveParent keeps a top-level parent and rejects an unknown one', function () {
  var comments = [{ id: 'aaaaaaaa', parentId: null }];
  assert.deepEqual(lib.resolveParent('aaaaaaaa', comments), { ok: true, parentId: 'aaaaaaaa' });
  assert.deepEqual(lib.resolveParent(null, comments), { ok: true, parentId: null });
  assert.deepEqual(lib.resolveParent('zzzzzzzz', comments), { ok: false });
});

test('resolveParent flattens a reply to a reply onto its top-level ancestor', function () {
  var comments = [
    { id: 'aaaaaaaa', parentId: null },
    { id: 'bbbbbbbb', parentId: 'aaaaaaaa' }
  ];
  assert.deepEqual(lib.resolveParent('bbbbbbbb', comments), { ok: true, parentId: 'aaaaaaaa' });
});

test('buildThread nests replies, newest parents first, oldest replies first', function () {
  var comments = [
    { id: 'aaaaaaaa', parentId: null, ts: 100 },
    { id: 'bbbbbbbb', parentId: null, ts: 300 },
    { id: 'cccccccc', parentId: 'aaaaaaaa', ts: 200 },
    { id: 'dddddddd', parentId: 'aaaaaaaa', ts: 400 }
  ];
  var thread = lib.buildThread(comments);
  assert.deepEqual(thread.map(function (c) { return c.id; }), ['bbbbbbbb', 'aaaaaaaa']);
  assert.deepEqual(thread[0].replies, []);
  assert.deepEqual(thread[1].replies.map(function (c) { return c.id; }), ['cccccccc', 'dddddddd']);
});

test('buildThread drops a reply whose parent is gone', function () {
  var thread = lib.buildThread([{ id: 'cccccccc', parentId: 'aaaaaaaa', ts: 1 }]);
  assert.deepEqual(thread, []);
});

test('withoutComment removes a top-level comment and its replies', function () {
  var comments = [
    { id: 'aaaaaaaa', parentId: null },
    { id: 'bbbbbbbb', parentId: 'aaaaaaaa' },
    { id: 'cccccccc', parentId: null }
  ];
  assert.deepEqual(lib.withoutComment(comments, 'aaaaaaaa').map(function (c) { return c.id; }), ['cccccccc']);
});

test('withoutComment removes a single reply and leaves its parent', function () {
  var comments = [
    { id: 'aaaaaaaa', parentId: null },
    { id: 'bbbbbbbb', parentId: 'aaaaaaaa' }
  ];
  assert.deepEqual(lib.withoutComment(comments, 'bbbbbbbb').map(function (c) { return c.id; }), ['aaaaaaaa']);
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test api/_lib.test.js`
Expected: FAIL — `Cannot find module './_lib.js'`

- [ ] **Step 3: Write `api/_lib.js`**

```js
// The rules, with no network anywhere near them. Everything in this file is a
// pure function of its arguments so the whole rule set can be tested with
// `node --test api/` and no Upstash account.
'use strict';

var crypto = require('crypto');

var SLUG_RE = /^[a-z0-9-]{1,80}$/;
var ID_RE = /^[a-z0-9]{8}$/;

var NAME_MAX = 60;
var BODY_MAX = 2000;
var THREAD_MAX = 500;
var RATE_WINDOW = 600;
var COMMENT_RATE = 3;
var LIKE_RATE = 10;

function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

// Eight base36 characters out of eight random bytes. The generator is injected
// so a test can pin the bytes; production passes nothing and gets crypto.
function newId(randomBytes) {
  var bytes = (randomBytes || crypto.randomBytes)(8);
  var out = '';
  for (var i = 0; i < 8; i++) out += (bytes[i] % 36).toString(36);
  return out;
}

// The rate limiter needs to recognise a repeat visitor without the site ever
// holding their address. A salted hash, truncated, does both.
function hashIp(ip, salt) {
  return crypto.createHash('sha256').update(String(salt) + ':' + String(ip)).digest('hex').slice(0, 16);
}

// A comment body is prose, so newlines survive; every other control character
// is something a human keyboard did not send.
function clean(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function fail(status, error) {
  return { ok: false, status: status, error: error };
}

function validateComment(input) {
  var raw = input || {};

  if (!isValidSlug(raw.slug)) return fail(400, 'Unknown post.');

  // The honeypot is a field only a form-filling script can see. Its message is
  // deliberately generic: a bot author learns nothing about why it failed.
  if (clean(raw.hp)) return fail(400, 'Comment rejected.');

  var name = clean(raw.name);
  if (!name || name.length > NAME_MAX) return fail(400, 'Name must be 1 to ' + NAME_MAX + ' characters.');

  var body = clean(raw.body);
  if (!body || body.length > BODY_MAX) return fail(400, 'Comment must be 1 to ' + BODY_MAX + ' characters.');

  var parentId = raw.parentId == null || raw.parentId === '' ? null : String(raw.parentId);
  if (parentId !== null && !ID_RE.test(parentId)) return fail(400, 'Unknown parent comment.');

  return { ok: true, value: { slug: raw.slug, name: name, body: body, parentId: parentId } };
}

// One level of nesting, enforced here rather than in the UI: a reply aimed at a
// reply lands beside it under the same top-level comment.
function resolveParent(parentId, comments) {
  if (parentId === null || parentId === undefined) return { ok: true, parentId: null };

  var parent = null;
  for (var i = 0; i < comments.length; i++) {
    if (comments[i].id === parentId) { parent = comments[i]; break; }
  }
  if (!parent) return { ok: false };

  return { ok: true, parentId: parent.parentId ? parent.parentId : parent.id };
}

// Newest conversation first, but each conversation reads top to bottom.
function buildThread(comments) {
  var tops = [];
  var byId = {};

  comments.forEach(function (comment) {
    if (comment.parentId) return;
    var top = Object.assign({}, comment, { replies: [] });
    byId[comment.id] = top;
    tops.push(top);
  });

  comments.forEach(function (comment) {
    if (!comment.parentId) return;
    var parent = byId[comment.parentId];
    if (parent) parent.replies.push(comment);   // an orphan is simply dropped
  });

  tops.sort(function (a, b) { return b.ts - a.ts; });
  tops.forEach(function (top) {
    top.replies.sort(function (a, b) { return a.ts - b.ts; });
  });

  return tops;
}

// Deleting a comment deletes the conversation hanging off it.
function withoutComment(comments, id) {
  return comments.filter(function (comment) {
    return comment.id !== id && comment.parentId !== id;
  });
}

module.exports = {
  isValidSlug: isValidSlug,
  newId: newId,
  hashIp: hashIp,
  validateComment: validateComment,
  resolveParent: resolveParent,
  buildThread: buildThread,
  withoutComment: withoutComment,
  NAME_MAX: NAME_MAX,
  BODY_MAX: BODY_MAX,
  THREAD_MAX: THREAD_MAX,
  RATE_WINDOW: RATE_WINDOW,
  COMMENT_RATE: COMMENT_RATE,
  LIKE_RATE: LIKE_RATE
};
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test api/_lib.test.js`
Expected: PASS, 14 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add api/_lib.js api/_lib.test.js
git commit -m "Add the pure rules behind blog comments, with tests"
```

---

### Task 2: The two I/O modules

Both are thin, both are the only file in the codebase that knows their protocol, and both are exercised for real in Task 7. They are `_`-prefixed because they export helpers rather than a request handler.

**Files:**
- Create: `api/_upstash.js`, `api/_notify.js`

**Interfaces:**
- Consumes: `RATE_WINDOW` from `api/_lib.js`.
- Produces, used by Tasks 3 and 4:
  - `_upstash.configured() -> boolean`
  - `_upstash.listGet(key) -> Promise<Array<object>>`
  - `_upstash.listAppend(key, value) -> Promise<void>`
  - `_upstash.listReplace(key, values) -> Promise<void>`
  - `_upstash.counterGet(key) -> Promise<number>`
  - `_upstash.counterIncrement(key) -> Promise<number>`
  - `_upstash.rateLimit(key, limit) -> Promise<boolean>` (true = allowed)
  - `_notify.commentPosted({ slug, title, name, body, id }) -> Promise<void>` (never rejects)

- [ ] **Step 1: Write `api/_upstash.js`**

```js
// The only file that speaks Redis. Upstash exposes every command over one HTTP
// endpoint that takes the command as a JSON array, which is why this feature
// needs no client library and therefore no package.json in the deploy.
'use strict';

var lib = require('./_lib.js');

function configured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function command(args) {
  var response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  if (!response.ok) throw new Error('Upstash responded ' + response.status);

  var payload = await response.json();
  if (payload.error) throw new Error('Upstash: ' + payload.error);
  return payload.result;
}

// A stored element that will not parse is a corrupt write, not a reason to fail
// the whole page: drop it and serve the rest.
async function listGet(key) {
  var raw = await command(['LRANGE', key, '0', '-1']);
  return (raw || []).map(function (item) {
    try { return JSON.parse(item); } catch (err) { return null; }
  }).filter(Boolean);
}

async function listAppend(key, value) {
  await command(['RPUSH', key, JSON.stringify(value)]);
}

// Used only by delete. Two commands rather than one transaction: the window
// between them is microseconds on a blog where two people rarely comment in the
// same second, and MULTI over REST costs a round trip on every delete.
async function listReplace(key, values) {
  await command(['DEL', key]);
  if (!values.length) return;
  await command(['RPUSH', key].concat(values.map(function (v) { return JSON.stringify(v); })));
}

async function counterGet(key) {
  var value = await command(['GET', key]);
  return Number(value) || 0;
}

async function counterIncrement(key) {
  return Number(await command(['INCR', key])) || 0;
}

// A fixed window, not a sliding one. The first request in a window sets the
// expiry; everything after it just counts.
async function rateLimit(key, limit) {
  var count = Number(await command(['INCR', key])) || 0;
  if (count === 1) await command(['EXPIRE', key, String(lib.RATE_WINDOW)]);
  return count <= limit;
}

module.exports = {
  configured: configured,
  listGet: listGet,
  listAppend: listAppend,
  listReplace: listReplace,
  counterGet: counterGet,
  counterIncrement: counterIncrement,
  rateLimit: rateLimit
};
```

- [ ] **Step 2: Write `api/_notify.js`**

```js
// The only file that speaks Resend. Everything here is best-effort: the comment
// is already saved by the time this runs, and a reader should never see an
// error because a notification did not send.
'use strict';

var SITE = 'https://akshatiwari.com';

// Resend's sandbox sender needs no verified domain as long as the recipient is
// the account owner. Verifying a domain later changes this line and nothing else.
var FROM = 'Blog comments <onboarding@resend.dev>';
var TO = 'akshat.tiwari@ollive.ai';

async function commentPosted(comment) {
  if (!process.env.RESEND_API_KEY) return;

  var url = SITE + '/blog/' + comment.slug + '/#comment-' + comment.id;
  var text = comment.name + ' commented on "' + comment.title + '":\n\n' +
             comment.body + '\n\n' + url + '\n';

  try {
    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        subject: 'New comment on ' + comment.title,
        text: text
      })
    });
    if (!response.ok) console.error('Resend responded ' + response.status);
  } catch (err) {
    console.error('Resend failed: ' + err.message);
  }
}

module.exports = { commentPosted: commentPosted };
```

- [ ] **Step 3: Check both modules parse**

Run: `node -e "require('./api/_upstash.js'); require('./api/_notify.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Confirm the unit tests still pass**

Run: `node --test api/_lib.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add api/_upstash.js api/_notify.js
git commit -m "Add the Redis and email edges for blog comments"
```

---

### Task 3: `GET|POST /api/likes`

The smaller handler first, so the request/response conventions are settled before the complicated one.

**Files:**
- Create: `api/likes.js`

**Interfaces:**
- Consumes: `_lib.isValidSlug`, `_lib.hashIp`, `_lib.LIKE_RATE`; all of `_upstash`.
- Produces: `GET /api/likes?slug=<slug> -> { likes: number }`, `POST /api/likes` with body `{ slug } -> { likes: number }`. Used by Task 6.

- [ ] **Step 1: Write `api/likes.js`**

```js
// One counter per post. The "one like per browser" rule lives in localStorage on
// the client — this endpoint only refuses to be hammered.
'use strict';

var lib = require('./_lib.js');
var redis = require('./_upstash.js');

function clientIp(req) {
  var forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? String(forwarded).split(',')[0] : '').trim() || 'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!redis.configured()) {
    return res.status(503).json({ error: 'Likes are not configured.' });
  }

  var slug = req.method === 'GET' ? req.query.slug : (req.body || {}).slug;
  if (!lib.isValidSlug(slug)) {
    return res.status(400).json({ error: 'Unknown post.' });
  }

  var key = 'post:' + slug + ':likes';

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ likes: await redis.counterGet(key) });
    }

    var ipHash = lib.hashIp(clientIp(req), process.env.IP_SALT || 'akshat-website');
    var allowed = await redis.rateLimit('rl:like:' + ipHash, lib.LIKE_RATE);
    if (!allowed) return res.status(429).json({ error: 'Too many likes. Try again shortly.' });

    return res.status(200).json({ likes: await redis.counterIncrement(key) });
  } catch (err) {
    console.error('likes failed: ' + err.message);
    return res.status(503).json({ error: 'Likes are unavailable right now.' });
  }
};
```

- [ ] **Step 2: Check it parses**

Run: `node -e "require('./api/likes.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add api/likes.js
git commit -m "Add the like counter endpoint"
```

---

### Task 4: `GET|POST|DELETE /api/comments`

**Files:**
- Create: `api/comments.js`

**Interfaces:**
- Consumes: everything `_lib` exports, all of `_upstash`, `_notify.commentPosted`.
- Produces, all used by Task 6:
  - `GET /api/comments?slug=<slug> -> { comments: Array<{ id, name, body, ts, author, replies: [...] }> }`
  - `POST /api/comments` body `{ slug, title, name, body, parentId, hp, token } -> 201 { comment }`
  - `DELETE /api/comments` body `{ slug, id, token } -> 204`

- [ ] **Step 1: Write `api/comments.js`**

```js
// The comment thread for one post. Reads are cheap and open; writes go through
// every rule in _lib.js first.
'use strict';

var lib = require('./_lib.js');
var redis = require('./_upstash.js');
var notify = require('./_notify.js');

function clientIp(req) {
  var forwarded = req.headers['x-forwarded-for'];
  return (forwarded ? String(forwarded).split(',')[0] : '').trim() || 'unknown';
}

// A wrong guess at the token posts an ordinary comment rather than an error, so
// someone probing for it cannot tell a wrong token from no token.
function isAdmin(token) {
  var expected = process.env.ADMIN_TOKEN;
  return Boolean(expected) && token === expected;
}

function key(slug) {
  return 'post:' + slug + ':comments';
}

async function read(req, res) {
  var slug = req.query.slug;
  if (!lib.isValidSlug(slug)) return res.status(400).json({ error: 'Unknown post.' });

  var stored = await redis.listGet(key(slug));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ comments: lib.buildThread(stored) });
}

async function create(req, res) {
  var input = req.body || {};

  var checked = lib.validateComment(input);
  if (!checked.ok) return res.status(checked.status).json({ error: checked.error });

  var admin = isAdmin(input.token);

  if (!admin) {
    var ipHash = lib.hashIp(clientIp(req), process.env.IP_SALT || 'akshat-website');
    var allowed = await redis.rateLimit('rl:comment:' + ipHash, lib.COMMENT_RATE);
    if (!allowed) {
      return res.status(429).json({ error: 'You have posted a few already. Try again in a few minutes.' });
    }
  }

  var stored = await redis.listGet(key(checked.value.slug));
  if (stored.length >= lib.THREAD_MAX) {
    return res.status(409).json({ error: 'This post has reached its comment limit.' });
  }

  var parent = lib.resolveParent(checked.value.parentId, stored);
  if (!parent.ok) return res.status(400).json({ error: 'That comment no longer exists.' });

  var comment = {
    id: lib.newId(),
    parentId: parent.parentId,
    name: checked.value.name,
    body: checked.value.body,
    ts: Date.now(),
    author: admin
  };

  await redis.listAppend(key(checked.value.slug), comment);

  // Deliberately not awaited into the response path: the comment is saved, and
  // a failed notification must not become the reader's error.
  await notify.commentPosted({
    slug: checked.value.slug,
    title: typeof input.title === 'string' ? input.title.slice(0, 200) : checked.value.slug,
    name: comment.name,
    body: comment.body,
    id: comment.id
  });

  return res.status(201).json({ comment: comment });
}

async function remove(req, res) {
  var input = req.body || {};
  if (!isAdmin(input.token)) return res.status(401).json({ error: 'Not allowed.' });
  if (!lib.isValidSlug(input.slug)) return res.status(400).json({ error: 'Unknown post.' });

  var stored = await redis.listGet(key(input.slug));
  var remaining = lib.withoutComment(stored, String(input.id));
  if (remaining.length !== stored.length) await redis.listReplace(key(input.slug), remaining);

  return res.status(204).end();
}

module.exports = async function handler(req, res) {
  if (!redis.configured()) {
    return res.status(503).json({ error: 'Comments are not configured.' });
  }

  try {
    if (req.method === 'GET') return await read(req, res);
    if (req.method === 'POST') return await create(req, res);
    if (req.method === 'DELETE') return await remove(req, res);
  } catch (err) {
    console.error('comments failed: ' + err.message);
    return res.status(503).json({ error: 'Comments are unavailable right now.' });
  }

  res.setHeader('Allow', 'GET, POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
};
```

- [ ] **Step 2: Check it parses**

Run: `node -e "require('./api/comments.js'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Confirm the unit tests still pass**

Run: `node --test api/_lib.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 4: Commit**

```bash
git add api/comments.js
git commit -m "Add the comment thread endpoint"
```

---

### Task 5: The section in the generated page

**Files:**
- Modify: `build.js` — `renderPost`, around [build.js:530](../../../build.js#L530)
- Modify: `machine-view.js:51` — `NOT_CONTENT`

**Interfaces:**
- Produces the DOM contract Task 6 reads: `.comments[data-slug][data-title]` containing `[data-like]`, `[data-like-count]`, `[data-comment-count]`, `[data-comment-form]`, `[data-comment-status]`, `[data-comment-list]`, and a honeypot input named `hp`.

- [ ] **Step 1: Add the section to `renderPost`**

In `build.js`, replace the "All posts" section block with the engagement section followed by it, and append the script tag. The block currently reads:

```js
  <section class="section container" data-reveal>
    <a class="post-back" href="/blog/"><span class="post-back-arrow" aria-hidden="true">&larr;</span>All posts</a>
  </section>
  </div>
</main>
` + FOOT;
```

Change it to:

```js
  <section class="section container comments" data-reveal data-slug="${post.slug}" data-title="${escapeHtml(post.title)}">
    <div class="prose">
      <button class="like" type="button" data-like aria-pressed="false">
        <span class="like-mark" aria-hidden="true">&#9825;</span>
        <span class="like-count" data-like-count>&nbsp;</span>
        <span class="visually-hidden">Like this post</span>
      </button>

      <p class="kicker" data-comment-count>Comments</p>

      <form class="comment-form" data-comment-form novalidate>
        <label class="visually-hidden" for="comment-name">Name</label>
        <input class="comment-field" id="comment-name" name="name" type="text"
               maxlength="60" placeholder="Name" autocomplete="name" required>

        <label class="visually-hidden" for="comment-body">Comment</label>
        <textarea class="comment-field comment-body" id="comment-body" name="body" rows="4"
                  maxlength="2000" placeholder="Say something" required></textarea>

        <div class="comment-trap" aria-hidden="true">
          <label for="comment-website">Website</label>
          <input id="comment-website" name="hp" type="text" tabindex="-1" autocomplete="off">
        </div>

        <div class="comment-actions">
          <p class="comment-status" data-comment-status role="status"></p>
          <button class="btn" type="submit">Post</button>
        </div>
      </form>

      <ol class="comment-list" data-comment-list></ol>
    </div>
  </section>

  <section class="section container" data-reveal>
    <a class="post-back" href="/blog/"><span class="post-back-arrow" aria-hidden="true">&larr;</span>All posts</a>
  </section>
  </div>
</main>
<script src="/comments.js" defer></script>
` + FOOT;
```

The script tag goes here rather than in `head()` on purpose: the shared shell stays byte-identical to the four hand-written pages, so CLAUDE.md's "change the shell in both places" rule never comes into play.

- [ ] **Step 2: Exclude the section from machine view**

In `machine-view.js`, line 51 currently reads:

```js
  var NOT_CONTENT = '.telemetry';
```

Replace it, keeping the existing comment above it intact and adding a second one:

```js
  // The clocks are an instrument, not writing: a crawler fetching the HTML gets
  // a placeholder, and the zone labels around them only describe the widget.
  //
  // Comments are writing, but they are not his: machine view is the words on the
  // page as authored, and the CONTENT selector would otherwise read every
  // visitor's paragraph into the readout.
  var NOT_CONTENT = '.telemetry, .comments';
```

- [ ] **Step 3: Rebuild and inspect the output**

Run: `node build.js && grep -c 'data-comment-list' blog/*/index.html`
Expected: `1` for each of the three post directories, and no match in `blog/index.html`.

- [ ] **Step 4: Confirm the shell did not move**

Run: `git diff --stat index.html work/index.html beyond-work/index.html contact/index.html`
Expected: no output — the hand-written pages are untouched.

- [ ] **Step 5: Commit**

```bash
git add build.js machine-view.js blog sitemap.xml index.html
git commit -m "Emit the comment section on every post page"
```

---

### Task 6: The browser script

**Files:**
- Create: `comments.js`

**Interfaces:**
- Consumes the DOM contract from Task 5 and all four endpoints from Tasks 3 and 4.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write `comments.js`**

```js
// The engagement section on a blog post: one like button and a thread that
// nests exactly one level. Every string that came from a stranger is written
// with textContent — there is no innerHTML in this file, and that is the point.
(function () {
  'use strict';

  var root = document.querySelector('.comments[data-slug]');
  if (!root) return;

  var slug = root.getAttribute('data-slug');
  var title = root.getAttribute('data-title') || slug;

  var list = root.querySelector('[data-comment-list]');
  var form = root.querySelector('[data-comment-form]');
  var status = root.querySelector('[data-comment-status]');
  var counter = root.querySelector('[data-comment-count]');
  var likeButton = root.querySelector('[data-like]');
  var likeCount = root.querySelector('[data-like-count]');

  var LIKED_KEY = 'akshat:liked:' + slug;
  var TOKEN_KEY = 'akshat:admin-token';

  var replyingTo = null;

  // ---------- storage, defensively ----------

  // Safari in private mode throws on localStorage rather than returning null.
  function stored(key) {
    try { return window.localStorage.getItem(key); } catch (err) { return null; }
  }

  function store(key, value) {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (err) { /* a browser that refuses storage still gets a working page */ }
  }

  // ---------- admin ----------

  // ?admin=<token> stores the token and leaves the address bar clean, so the
  // token is not sitting in a screenshot or a shared link.
  (function claimToken() {
    var match = window.location.search.match(/[?&]admin=([^&]*)/);
    if (!match) return;
    var token = decodeURIComponent(match[1]);
    store(TOKEN_KEY, token || null);
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }());

  function token() {
    return stored(TOKEN_KEY);
  }

  // ---------- time ----------

  function ago(ts) {
    var seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
    var steps = [
      [60, 'just now', null],
      [3600, null, 60],
      [86400, null, 3600],
      [2592000, null, 86400]
    ];
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return plural(Math.floor(seconds / 60), 'minute');
    if (seconds < 86400) return plural(Math.floor(seconds / 3600), 'hour');
    if (seconds < 2592000) return plural(Math.floor(seconds / 86400), 'day');
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function plural(n, unit) {
    return n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
  }

  // ---------- rendering ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderComment(comment, isReply) {
    var item = el('li', isReply ? 'comment comment-reply' : 'comment');
    item.id = 'comment-' + comment.id;

    var meta = el('p', 'comment-meta');
    meta.appendChild(el('span', 'comment-name', comment.name));
    if (comment.author) meta.appendChild(el('span', 'comment-badge', 'Author'));
    meta.appendChild(el('span', 'comment-time', ago(comment.ts)));
    item.appendChild(meta);

    // Paragraph per blank-line-separated block, so a multi-paragraph comment
    // reads like the post above it.
    comment.body.split(/\n{2,}/).forEach(function (block) {
      item.appendChild(el('p', 'comment-text', block));
    });

    var actions = el('p', 'comment-tools');

    if (!isReply) {
      var reply = el('button', 'comment-link', 'Reply');
      reply.type = 'button';
      reply.addEventListener('click', function () { startReply(comment, item); });
      actions.appendChild(reply);
    }

    if (token()) {
      var remove = el('button', 'comment-link', 'Delete');
      remove.type = 'button';
      remove.addEventListener('click', function () { deleteComment(comment.id); });
      actions.appendChild(remove);
    }

    if (actions.childNodes.length) item.appendChild(actions);

    if (comment.replies && comment.replies.length) {
      var sub = el('ol', 'comment-replies');
      comment.replies.forEach(function (child) { sub.appendChild(renderComment(child, true)); });
      item.appendChild(sub);
    }

    return item;
  }

  function render(comments) {
    var total = comments.reduce(function (sum, c) {
      return sum + 1 + (c.replies ? c.replies.length : 0);
    }, 0);
    counter.textContent = total === 0 ? 'Comments' : 'Comments · ' + total;

    list.textContent = '';

    if (!comments.length) {
      list.appendChild(el('li', 'comment-empty', 'No comments yet.'));
      return;
    }

    comments.forEach(function (comment) { list.appendChild(renderComment(comment, false)); });
  }

  // ---------- reply ----------

  function startReply(comment, item) {
    replyingTo = comment.id;
    item.appendChild(form);
    form.classList.add('is-replying');
    setStatus('Replying to ' + comment.name + '.', false);
    ensureCancel();
    form.querySelector('.comment-body').focus();
  }

  function ensureCancel() {
    if (form.querySelector('[data-cancel-reply]')) return;
    var cancel = el('button', 'comment-link', 'Cancel');
    cancel.type = 'button';
    cancel.setAttribute('data-cancel-reply', '');
    cancel.addEventListener('click', endReply);
    form.querySelector('.comment-actions').insertBefore(cancel, form.querySelector('.btn'));
  }

  function endReply() {
    replyingTo = null;
    form.classList.remove('is-replying');
    var cancel = form.querySelector('[data-cancel-reply]');
    if (cancel) cancel.parentNode.removeChild(cancel);
    root.querySelector('.prose').insertBefore(form, list);
    setStatus('', false);
  }

  // ---------- status ----------

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle('is-error', Boolean(isError));
  }

  // ---------- network ----------

  async function load() {
    try {
      var response = await fetch('/api/comments?slug=' + encodeURIComponent(slug));
      if (!response.ok) throw new Error('status ' + response.status);
      var data = await response.json();
      render(data.comments || []);
    } catch (err) {
      list.textContent = '';
      var failure = el('li', 'comment-empty', 'Comments could not load. ');
      var retry = el('button', 'comment-link', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', load);
      failure.appendChild(retry);
      list.appendChild(failure);
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    var name = form.querySelector('[name="name"]').value;
    var body = form.querySelector('.comment-body').value;
    var submit = form.querySelector('.btn');

    if (!name.trim() || !body.trim()) {
      setStatus('A name and a comment, please.', true);
      return;
    }

    submit.disabled = true;
    setStatus('Posting…', false);

    try {
      var response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: slug,
          title: title,
          name: name,
          body: body,
          parentId: replyingTo,
          hp: form.querySelector('[name="hp"]').value,
          token: token()
        })
      });

      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'Something went wrong.');

      // Only the body is cleared: the name is worth keeping for a second comment,
      // and on failure nothing is cleared at all so no typing is ever lost.
      form.querySelector('.comment-body').value = '';
      endReply();
      setStatus('Posted.', false);
      await load();
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      submit.disabled = false;
    }
  });

  async function deleteComment(id) {
    if (!window.confirm('Delete this comment?')) return;
    try {
      var response = await fetch('/api/comments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug, id: id, token: token() })
      });
      if (!response.ok) throw new Error('Delete failed.');
      await load();
    } catch (err) {
      setStatus(err.message, true);
    }
  }

  // ---------- likes ----------

  function paintLike(count, liked) {
    likeCount.textContent = String(count);
    likeButton.setAttribute('aria-pressed', liked ? 'true' : 'false');
    likeButton.classList.toggle('is-liked', liked);
    likeButton.querySelector('.like-mark').textContent = liked ? '♥' : '♡';
  }

  async function loadLikes() {
    try {
      var response = await fetch('/api/likes?slug=' + encodeURIComponent(slug));
      if (!response.ok) throw new Error('status ' + response.status);
      var data = await response.json();
      paintLike(data.likes || 0, stored(LIKED_KEY) === '1');
    } catch (err) {
      likeButton.hidden = true;   // a broken counter is worse than no counter
    }
  }

  likeButton.addEventListener('click', async function () {
    if (stored(LIKED_KEY) === '1') return;

    likeButton.disabled = true;
    try {
      var response = await fetch('/api/likes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug })
      });
      if (!response.ok) throw new Error('status ' + response.status);
      var data = await response.json();
      store(LIKED_KEY, '1');
      paintLike(data.likes || 0, true);
    } catch (err) {
      setStatus('That like did not save.', true);
    } finally {
      likeButton.disabled = false;
    }
  });

  load();
  loadLikes();
}());
```

- [ ] **Step 2: Remove the dead `steps` array**

The `ago()` function above contains a leftover `steps` array that nothing reads. Delete those six lines. Then run `node --check comments.js`.
Expected: no output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add comments.js
git commit -m "Render the comment thread and the like button in the browser"
```

---

### Task 7: The styles

**Files:**
- Modify: `styles.css`

- [ ] **Step 1: Append the section's styles**

Add at the end of the file, before the `@media (prefers-contrast: more)` block:

```css
/* ---------- Comments and likes (blog posts) ---------- */

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.comments .prose { max-width: 45rem; }

.like {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-body-sm);
  color: var(--color-ink);
  background: transparent;
  border: 1px solid var(--color-mist);
  border-radius: 9999px;
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  margin-bottom: var(--space-12);
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.like:hover { border-color: var(--color-gray); background: var(--color-tint-hover); }
.like.is-liked { border-color: var(--color-ink); background: var(--color-ink); color: var(--color-paper); }
.like[disabled] { opacity: 0.5; cursor: default; }

.comment-form { margin-bottom: var(--space-12); }
.comment-form.is-replying { margin-top: var(--space-6); }

.comment-field {
  display: block;
  width: 100%;
  font-family: var(--font-body);
  font-size: var(--text-body-sm);
  color: var(--color-ink);
  background: transparent;
  border: 1px solid var(--color-mist);
  border-radius: 0;
  padding: var(--space-3);
  margin-bottom: var(--space-3);
}

.comment-field::placeholder { color: var(--color-gray); }
.comment-field:focus { outline: none; border-color: var(--color-ink); }
.comment-body { resize: vertical; min-height: 7rem; }

/* The honeypot: off-screen rather than display:none, because a bot that reads
   styles skips a hidden field but fills one it can find. */
.comment-trap {
  position: absolute;
  left: -9999px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.comment-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
}

.comment-status {
  margin: 0;
  margin-right: auto;
  font-size: var(--text-body-sm);
  color: var(--color-gray);
}

.comment-status.is-error { color: var(--color-ink); }

.comment-list { list-style: none; margin: 0; padding: 0; }

.comment {
  border-top: 1px solid var(--color-mist);
  padding-top: var(--space-6);
  margin-top: var(--space-6);
}

.comment-meta {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
  font-size: var(--text-body-sm);
}

.comment-name { color: var(--color-ink); }

.comment-badge {
  font-size: var(--text-kicker);
  letter-spacing: var(--track-kicker);
  text-transform: uppercase;
  color: var(--color-gray);
  border: 1px solid var(--color-mist);
  padding: 0 var(--space-2);
}

.comment-time { color: var(--color-gray); font-size: var(--text-kicker); }

.comment-text { margin: 0 0 var(--space-3); white-space: pre-wrap; }

.comment-tools { display: flex; gap: var(--space-4); margin: 0; }

.comment-link {
  font-family: var(--font-body);
  font-size: var(--text-kicker);
  letter-spacing: var(--track-kicker);
  text-transform: uppercase;
  color: var(--color-gray);
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
}

.comment-link:hover { color: var(--color-ink); }

.comment-replies {
  list-style: none;
  margin: var(--space-6) 0 0;
  padding-left: var(--space-6);
  border-left: 1px solid var(--color-mist);
}

.comment-replies .comment { border-top: 0; padding-top: 0; margin-top: var(--space-6); }
.comment-replies .comment:first-child { margin-top: 0; }

.comment-empty { color: var(--color-gray); padding-top: var(--space-6); }
```

- [ ] **Step 2: Fold the new muted text into the high-contrast block**

In the `@media (prefers-contrast: more)` block, the long selector list that ends `.post-row-date, .post-row-excerpt, .post-back, .post-body th,` gains three more. Add to that list:

```css
  .comment-time, .comment-badge, .comment-link, .comment-status, .comment-empty,
```

- [ ] **Step 3: Verify against the design tokens**

Run: `grep -n '#[0-9a-fA-F]\{3,6\}' styles.css | sed -n '/comment\|like/p'`
Expected: no output — every colour in the new block is a token.

- [ ] **Step 4: Look at it**

Run: `python3 -m http.server 8899` and open `http://localhost:8899/blog/the-creator-economy-is-a-recursive-loop/`.
Expected: the like button and form render in the site's type and hairlines; the thread shows "Comments could not load" because no API exists locally. Check both light and dark themes with the theme toggle.

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "Style the comment section in the site's own hairlines"
```

---

### Task 8: Live verification on a preview deployment

Upstash and Resend exist nowhere but a real deployment, so this is where the handlers are actually tested. **This task needs Akshat** — he owns the Vercel dashboard.

**Files:** none.

- [ ] **Step 1: Ask Akshat to set the environment variables**

He needs, in the Vercel dashboard, for Preview and Production:

- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` — added automatically by the Upstash integration from the Vercel Marketplace.
- `RESEND_API_KEY` — from resend.com.
- `ADMIN_TOKEN` — any long random string. Generate one with `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`.
- `IP_SALT` — another random string from the same command.

- [ ] **Step 2: Push the branch and get the preview URL**

```bash
git push -u origin blog-engagement
```

- [ ] **Step 3: Walk the checklist on the preview**

Use the `/browse` skill. On any post page:

1. Post a comment. It appears without a reload, and the count reads "Comments · 1".
2. An email arrives.
3. Reply to it. The reply indents once under its parent.
4. Reply to the reply. It lands at the same level as the first reply, not deeper.
5. Reload. Everything survives, newest thread first.
6. Like the post. The pill fills. Reload: it is still filled and the count held.
7. Click like again. Nothing happens, no error.
8. Submit with an empty name. An inline message, no request sent.
9. Paste 2001 characters. The textarea caps at 2000.
10. Visit `?admin=<token>`. The address bar cleans itself, Delete appears on every comment, a new comment gets the Author badge.
11. Delete a top-level comment with replies. Its replies go with it.
12. Flip machine view on. The readout contains the post's words and no comment text.

- [ ] **Step 4: Fix anything the walk turns up, then re-run it**

- [ ] **Step 5: Merge**

```bash
git checkout main && git merge --ff-only blog-engagement && git push
```

---

## Self-Review

**Spec coverage:** Goals → Tasks 1–7. Data model → Task 1 (`buildThread`, `withoutComment`) and Task 2 (key patterns). HTTP API → Tasks 3 and 4, every validation row from the spec's table implemented in `validateComment` plus the handler's rate-limit, thread-cap and parent checks. Email → Task 2, failure-never-fails-the-request in Task 4. Front end files → Tasks 5 and 6. Machine view → Task 5. Styles → Task 7. Env vars → Task 8. Testing → Task 1 unit tests, Task 8 live checklist. Rollout → Task 8. No gaps.

**Deliberate deviation:** `api/_upstash.js` and `api/_notify.js` are not in the spec's file table. Recorded under Global Constraints above.

**Naming consistency:** `_lib` exports checked against every call site — `isValidSlug`, `newId`, `hashIp`, `validateComment`, `resolveParent`, `buildThread`, `withoutComment`, `NAME_MAX`, `BODY_MAX`, `THREAD_MAX`, `RATE_WINDOW`, `COMMENT_RATE`, `LIKE_RATE`. `_upstash` exports match their uses in `likes.js` and `comments.js`. The DOM contract in Task 5 matches every selector in Task 6, and every class in Task 6 has a rule in Task 7.
