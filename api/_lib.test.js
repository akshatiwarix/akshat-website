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
