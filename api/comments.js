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

  // commentPosted never rejects: the comment is already stored, and a failed
  // notification must not become the reader's error.
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
