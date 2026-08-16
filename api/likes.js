// One counter per post. The "one like per browser" rule lives in localStorage on
// the client; this endpoint only refuses to be hammered.
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
