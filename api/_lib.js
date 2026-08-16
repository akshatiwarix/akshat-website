// The rules, with no network anywhere near them. Everything in this file is a
// pure function of its arguments, so the whole rule set can be tested with
// `node --test api/` and no Upstash account.
'use strict';

var crypto = require('crypto');

var SLUG_RE = /^[a-z0-9-]{1,80}$/;
var ID_RE = /^[a-z0-9]{8}$/;

// A comment body is prose, so newlines survive. Every other control character
// is something no human keyboard sent.
var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

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

// The rate limiter has to recognise a repeat visitor without the site ever
// holding their address. A salted hash, truncated, does both.
function hashIp(ip, salt) {
  return crypto.createHash('sha256')
    .update(String(salt) + ':' + String(ip))
    .digest('hex')
    .slice(0, 16);
}

function clean(value) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(CONTROL_RE, '')
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
  if (!name || name.length > NAME_MAX) {
    return fail(400, 'Name must be 1 to ' + NAME_MAX + ' characters.');
  }

  var body = clean(raw.body);
  if (!body || body.length > BODY_MAX) {
    return fail(400, 'Comment must be 1 to ' + BODY_MAX + ' characters.');
  }

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
