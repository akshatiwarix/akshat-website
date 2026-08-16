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
