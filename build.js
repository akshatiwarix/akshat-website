#!/usr/bin/env node
//
// build.js — turns posts/*.md into the static pages the site actually serves.
//
// Run it with `node build.js`. It reads every markdown file in posts/, renders
// each one into blog/<slug>/index.html, then regenerates everything that has to
// agree with that set: the blog index, the latest-posts block on the homepage,
// feed.xml, sitemap.xml and robots.txt.
//
// Design constraints this script inherits, and must not break:
//   - Zero dependencies. There is no package.json and no node_modules, so the
//     markdown renderer below is hand-written. Anything it can't express, a post
//     can drop to raw HTML for (see the block rules).
//   - The generated HTML is committed. Vercel serves plain static files and runs
//     no build command; if this script ever breaks, the live site is unaffected.
//   - Every page it emits is byte-for-byte in the same shell as the four
//     hand-written pages: same head, same header, same footer, same scripts.
//
// Two halves with a hard seam: the markdown renderer knows nothing about the
// site, and the page builders know nothing about markdown.

'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var POSTS_DIR = path.join(ROOT, 'posts');
var BLOG_DIR = path.join(ROOT, 'blog');

var SITE = {
  url: 'https://www.akshatiwari.com',
  title: 'Akshat Tiwari',
  author: 'Akshat Tiwari',
  ogImage: '/assets/og-card.jpg',
  blogTitle: 'Blog — Akshat Tiwari, GTM Engineer',
  blogDescription:
    'Writing by Akshat Tiwari, GTM Engineer — the work, the things he builds on the side, and what he is figuring out along the way.',
  blogIntro:
    'Notes on the work, the things I build on the side, and what I&rsquo;m figuring out along the way.',
  blogEmpty: 'The first post is being written. Check back shortly.'
};

var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
              'August', 'September', 'October', 'November', 'December'];
var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
                    'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// XML is stricter than HTML about the bare apostrophe in attribute values, and
// the feed carries titles and excerpts written for humans.
function escapeXml(s) {
  return escapeHtml(s).replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------
//
// Deliberately not YAML: `key: value` pairs, one per line, values taken as
// literal strings with `true`/`false` recognised. Optional surrounding quotes
// are stripped so a title containing a colon can be written safely.

function parseFrontMatter(raw) {
  var match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, body: raw };

  var data = {};
  match[1].split(/\r?\n/).forEach(function (line) {
    if (!line.trim() || /^\s*#/.test(line)) return;
    var sep = line.indexOf(':');
    if (sep === -1) return;
    var key = line.slice(0, sep).trim();
    var value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    data[key] = value;
  });

  return { data: data, body: raw.slice(match[0].length) };
}

// ---------------------------------------------------------------------------
// Markdown — inline
// ---------------------------------------------------------------------------
//
// Code spans are lifted out first and put back last, so their contents never
// get read as emphasis or a link. Everything between those two steps operates
// on text that has already been HTML-escaped.

function renderInline(text) {
  // The marker survives escaping untouched and carries no surrounding
  // whitespace, so `a` mid-sentence comes back with its spaces intact.
  var codes = [];
  var out = text.replace(/`([^`]+)`/g, function (_, code) {
    codes.push(code);
    return '%%CODE' + (codes.length - 1) + '%%';
  });

  out = escapeHtml(out);

  // Images before links: the syntaxes differ only by the leading `!`.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
    return '<img src="' + src + '" alt="' + alt + '" loading="lazy">';
  });

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
    var external = /^https?:\/\//.test(href) && href.indexOf(SITE.url) !== 0;
    return '<a href="' + href + '"' +
      (external ? ' rel="noopener"' : '') + '>' + label + '</a>';
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])_([^_]+)_(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');

  return out.replace(/%%CODE(\d+)%%/g, function (_, i) {
    return '<code>' + escapeHtml(codes[Number(i)]) + '</code>';
  });
}

// ---------------------------------------------------------------------------
// Markdown — blocks
// ---------------------------------------------------------------------------
//
// Supported: ## / ### / #### headings, paragraphs, - and 1. lists, ``` fences,
// > quotes, | tables |, --- rules, @youtube(ID), and raw HTML blocks (any block
// whose first line starts with `<` passes through untouched — the escape hatch
// for anything this renderer doesn't cover).
//
// A single `#` is not a heading: the post title is the page's only h1 and it
// comes from front matter.

function renderMarkdown(src) {
  var lines = src.replace(/\r\n/g, '\n').split('\n');
  var html = [];
  var i = 0;

  function isBlank(line) { return !line || !line.trim(); }

  while (i < lines.length) {
    var line = lines[i];

    if (isBlank(line)) { i++; continue; }

    // Fenced code. The language is recorded on the <code> element for future
    // use but nothing styles or highlights it — highlighting would import a
    // colour palette the design system doesn't have.
    var fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (fence) {
      var code = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence
      html.push('<pre><code' +
        (fence[1] ? ' data-lang="' + escapeHtml(fence[1]) + '"' : '') + '>' +
        escapeHtml(code.join('\n')) + '</code></pre>');
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }

    // YouTube — the one embed the site supports.
    var yt = /^@youtube\(([\w-]+)\)\s*$/.exec(line);
    if (yt) {
      html.push(
        '<div class="post-embed">' +
        '<iframe src="https://www.youtube-nocookie.com/embed/' + yt[1] + '" ' +
        'title="YouTube video" loading="lazy" allowfullscreen ' +
        'allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture">' +
        '</iframe></div>'
      );
      i++;
      continue;
    }

    // Heading
    var heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      var level = heading[1].length;
      html.push('<h' + level + '>' + renderInline(heading[2].trim()) + '</h' + level + '>');
      i++;
      continue;
    }

    // Blockquote — consecutive `> ` lines become one quote, rendered as a
    // paragraph inside it so machine view reads the words.
    if (/^>\s?/.test(line)) {
      var quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push('<blockquote><p>' + renderInline(quote.join(' ').trim()) + '</p></blockquote>');
      continue;
    }

    // Lists — flat only. A nested list is a sign the post wants a different
    // structure, not a deeper renderer.
    var bullet = /^[-*]\s+(.*)$/.exec(line);
    var numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      var ordered = !!numbered;
      var items = [];
      while (i < lines.length) {
        var item = ordered
          ? /^\d+[.)]\s+(.*)$/.exec(lines[i])
          : /^[-*]\s+(.*)$/.exec(lines[i]);
        if (!item) break;
        items.push('<li>' + renderInline(item[1].trim()) + '</li>');
        i++;
      }
      var tag = ordered ? 'ol' : 'ul';
      html.push('<' + tag + '>' + items.join('') + '</' + tag + '>');
      continue;
    }

    // Table — a header row, a divider row, then body rows.
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      var cells = function (row) {
        return row.replace(/^\||\|$/g, '').split('|').map(function (c) { return c.trim(); });
      };
      var head = cells(line);
      i += 2;
      var body = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        body.push(cells(lines[i]));
        i++;
      }
      html.push(
        '<div class="post-table"><table><thead><tr>' +
        head.map(function (c) { return '<th>' + renderInline(c) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        body.map(function (row) {
          return '<tr>' + row.map(function (c) {
            return '<td>' + renderInline(c) + '</td>';
          }).join('') + '</tr>';
        }).join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    // Raw HTML block — passes through verbatim until the next blank line.
    if (/^</.test(line)) {
      var raw = [];
      while (i < lines.length && !isBlank(lines[i])) {
        raw.push(lines[i]);
        i++;
      }
      html.push(raw.join('\n'));
      continue;
    }

    // Paragraph — runs until a blank line or the start of another block.
    var para = [];
    while (i < lines.length && !isBlank(lines[i]) &&
           !/^(#{2,4}\s|>|```|@youtube\(|\||[-*]\s|\d+[.)]\s|<)/.test(lines[i]) &&
           !/^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) html.push('<p>' + renderInline(para.join(' ')) + '</p>');
    else i++; // a line that opened a block but matched no rule: don't spin
  }

  return html.join('\n');
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------
//
// Parsed as parts rather than through Date's string handling, which reads a
// bare YYYY-MM-DD as UTC and can show the previous day west of Greenwich.

function parseDate(value) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) throw new Error('date must be YYYY-MM-DD, got: ' + value);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), iso: m[0] };
}

function formatLong(date) {
  return date.d + ' ' + MONTHS[date.m - 1] + ' ' + date.y;
}

function formatShort(date) {
  return date.d + ' ' + MONTHS_SHORT[date.m - 1];
}

// RFC 822, which is what RSS readers expect. Midday UTC keeps the date the same
// in every reader's timezone.
function formatRfc822(date) {
  var day = DAYS_SHORT[new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()];
  var dd = String(date.d).padStart(2, '0');
  return day + ', ' + dd + ' ' + MONTHS_SHORT[date.m - 1] + ' ' + date.y + ' 12:00:00 +0000';
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
//
// Byte-identical to the shell the four hand-written pages use. If that shell
// changes there, it changes here too — these are the same document.

var NAV = [
  { href: '/', label: 'Home', key: 'home' },
  { href: '/work/', label: 'Work', key: 'work' },
  { href: '/blog/', label: 'Blog', key: 'blog' },
  { href: '/beyond-work/', label: 'Beyond Work', key: 'beyond' },
  { href: '/contact/', label: 'Contact', key: 'contact' }
];

function head(opts) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <!-- Theme is resolved in the same blocking script that sets .js, before first
       paint, so a dark-mode reader never sees a frame of white. -->
  <script>
  (function () {
    var root = document.documentElement;
    root.className += ' js';
    var stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) {}
    root.setAttribute('data-theme', stored === 'dark' || stored === 'light' ? stored :
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    var view = null;
    try { view = localStorage.getItem('view'); } catch (e) {}
    root.setAttribute('data-view', view === 'machine' ? 'machine' : 'default');
  })();
  </script>
  <title>${escapeHtml(opts.title)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}">
  <link rel="canonical" href="${SITE.url}${opts.path}">
  <meta property="og:title" content="${escapeHtml(opts.ogTitle || opts.title)}">
  <meta property="og:description" content="${escapeHtml(opts.description)}">
  <meta property="og:type" content="${opts.ogType || 'website'}">
  <meta property="og:url" content="${SITE.url}${opts.path}">
  <meta property="og:image" content="${SITE.url}${SITE.ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(opts.ogTitle || opts.title)}">
  <meta name="twitter:description" content="${escapeHtml(opts.description)}">
  <meta name="twitter:image" content="${SITE.url}${SITE.ogImage}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23000000'/><text x='50' y='72' font-size='64' font-family='sans-serif' fill='%23ffffff' text-anchor='middle'>A</text></svg>">
  <link rel="alternate" type="application/rss+xml" title="Akshat Tiwari — Blog" href="${SITE.url}/blog/feed.xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@300;400&family=Roboto:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <script src="/machine-view.js" defer></script>
  <script src="/site.js" defer></script>
  <script src="/_vercel/insights/script.js" defer></script>
  <script src="/_vercel/speed-insights/script.js" defer></script>${opts.jsonLd ? `
  <script type="application/ld+json">
${opts.jsonLd}
  </script>` : ''}
</head>
<body>

<header class="site-header">
  <div class="container">
    <a class="wordmark" href="/">Akshat Tiwari</a>
    <div class="header-right">
      <nav class="site-nav" aria-label="Site">
${NAV.map(function (item) {
  return '        <a href="' + item.href + '"' +
    (item.key === opts.nav ? ' aria-current="page"' : '') + '>' + item.label + '</a>';
}).join('\n')}
      </nav>
      <button class="theme-toggle" type="button" data-theme-toggle
              aria-pressed="false" aria-label="Switch to dark mode" title="Switch to dark mode">
        <span class="theme-icon theme-icon-moon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8 8.6 8.6 0 1 0 20.2 14.6Z"/></svg>
        </span>
        <span class="theme-icon theme-icon-sun" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M18.8 5.2l-1.5 1.5M6.7 17.3l-1.5 1.5"/></svg>
        </span>
      </button>
    </div>
  </div>
</header>
`;
}

var FOOT = `
<footer class="site-footer">
  <div class="container">
    <p class="kicker">Kanpur, India</p>
    <div class="footer-links">
      <a href="mailto:pi4akshat@gmail.com">Email</a>
      <a href="https://www.linkedin.com/in/akshatiwari/">LinkedIn</a>
      <a href="https://github.com/akshatiwarix">GitHub</a>
      <a href="https://x.com/whyakshat">X</a>
      <a href="https://www.youtube.com/@beyondakshat">YouTube</a>
    </div>
  </div>
</footer>

<button class="mv-switch" type="button" role="switch" aria-checked="false" data-machine-switch
        aria-label="Machine view: show only the text on this page"
        title="Machine view: show only the text on this page">
  <span class="mv-track" aria-hidden="true">
    <span class="mv-knob">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="3.2" r="1.2"/><path d="M12 4.4v3.1"/><rect x="4" y="7.5" width="16" height="12.5" rx="3.5"/><path d="M9.2 13.2h.01M14.8 13.2h.01M9.6 16.8h4.8"/></svg>
    </span>
  </span>
</button>

</body>
</html>
`;

// ---------------------------------------------------------------------------
// Reading posts
// ---------------------------------------------------------------------------

function readPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs.readdirSync(POSTS_DIR)
    .filter(function (name) { return name.endsWith('.md'); })
    .map(function (name) {
      var raw = fs.readFileSync(path.join(POSTS_DIR, name), 'utf8');
      var parsed = parseFrontMatter(raw);
      var data = parsed.data;
      var slug = data.slug || name.replace(/\.md$/, '');

      ['title', 'date', 'excerpt'].forEach(function (field) {
        if (!data[field]) {
          throw new Error(name + ': front matter is missing `' + field + '`');
        }
      });

      return {
        file: name,
        slug: slug,
        title: String(data.title),
        excerpt: String(data.excerpt),
        github: data.github ? String(data.github) : null,
        draft: data.draft === true,
        date: parseDate(data.date),
        html: renderMarkdown(parsed.body)
      };
    })
    .filter(function (post) { return !post.draft; })
    .sort(function (a, b) {
      if (a.date.iso !== b.date.iso) return a.date.iso < b.date.iso ? 1 : -1;
      return a.slug < b.slug ? -1 : 1;
    });
}

// ---------------------------------------------------------------------------
// Post page
// ---------------------------------------------------------------------------

function renderPost(post) {
  var url = SITE.url + '/blog/' + post.slug + '/';
  var jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date.iso,
    dateModified: post.date.iso,
    author: { '@type': 'Person', name: SITE.author, url: SITE.url + '/' },
    publisher: { '@type': 'Person', name: SITE.author, url: SITE.url + '/' },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: SITE.url + SITE.ogImage
  }, null, 2).split('\n').map(function (l) { return '  ' + l; }).join('\n');

  // The article's HTML is emitted flush left on purpose: indenting it to match
  // the surrounding markup would also indent every line inside a <pre>, where
  // whitespace is the code's own.

  return head({
    title: post.title + ' — Akshat Tiwari',
    ogTitle: post.title,
    description: post.excerpt,
    path: '/blog/' + post.slug + '/',
    nav: 'blog',
    ogType: 'article',
    jsonLd: jsonLd
  }) + `
<main>
  <section class="page-head container reveal sky">
    <div class="prose">
      <p class="kicker"><time datetime="${post.date.iso}">${formatLong(post.date)}</time></p>
      <h1 class="page-title">${escapeHtml(post.title)}</h1>${post.github ? `
      <div class="hero-actions">
        <a class="btn" href="${escapeHtml(post.github)}" rel="noopener">See the code on GitHub</a>
      </div>` : ''}
    </div>
  </section>

  <div class="sheet">
  <article class="section container prose post-body" data-reveal>
${post.html}
  </article>

  <section class="section container" data-reveal>
    <a class="post-back" href="/blog/"><span class="post-back-arrow" aria-hidden="true">&larr;</span>All posts</a>
  </section>
  </div>
</main>
` + FOOT;
}

// ---------------------------------------------------------------------------
// Post rows — one markup for the blog index and the homepage block
// ---------------------------------------------------------------------------

function postRow(post) {
  return `        <a class="post-row" href="/blog/${post.slug}/">
          <span class="post-row-date"><time datetime="${post.date.iso}">${formatShort(post.date)}</time></span>
          <span class="post-row-title">${escapeHtml(post.title)}</span>
          <span class="post-row-arrow" aria-hidden="true">&rarr;</span>
          <span class="post-row-excerpt">${escapeHtml(post.excerpt)}</span>
        </a>`;
}

// ---------------------------------------------------------------------------
// Blog index
// ---------------------------------------------------------------------------

function renderIndex(posts) {
  var years = [];
  posts.forEach(function (post) {
    var group = years[years.length - 1];
    if (!group || group.year !== post.date.y) {
      group = { year: post.date.y, posts: [] };
      years.push(group);
    }
    group.posts.push(post);
  });

  var body = posts.length
    ? years.map(function (group) {
        return `      <div class="post-year">
        <p class="kicker">${group.year}</p>
        <div class="post-rows">
${group.posts.map(postRow).join('\n')}
        </div>
      </div>`;
      }).join('\n')
    : `      <p class="muted">${SITE.blogEmpty}</p>`;

  return head({
    title: SITE.blogTitle,
    ogTitle: SITE.blogTitle,
    description: SITE.blogDescription,
    path: '/blog/',
    nav: 'blog'
  }) + `
<main>
  <section class="page-head container reveal sky">
    <div class="prose">
      <h1 class="page-title">Blog</h1>
      <p>${SITE.blogIntro}</p>
      <div class="hero-actions">
        <a class="btn" href="/blog/feed.xml">RSS feed</a>
      </div>
    </div>
  </section>

  <div class="sheet">
  <section class="section container" data-reveal>
${body}
  </section>
  </div>
</main>
` + FOOT;
}

// ---------------------------------------------------------------------------
// Homepage block
// ---------------------------------------------------------------------------
//
// Written between the markers already in index.html, so the hand-written page
// stays hand-written everywhere else. With no posts published the markers are
// left holding nothing, and the homepage is exactly what it was before.

var HOME_START = '<!-- BLOG:LATEST:START -->';
var HOME_END = '<!-- BLOG:LATEST:END -->';

function homeBlock(posts) {
  var latest = posts.slice(0, 3);
  if (!latest.length) return '';

  return `
  <section class="section container" data-reveal>
    <div class="section-head">
      <p class="kicker">Writing</p>
      <h2>Latest posts</h2>
    </div>
    <div class="post-rows">
${latest.map(postRow).join('\n')}
    </div>
    <div class="hero-actions">
      <a class="btn" href="/blog/">All posts</a>
    </div>
  </section>
  `;
}

function updateHome(posts) {
  var file = path.join(ROOT, 'index.html');
  var html = fs.readFileSync(file, 'utf8');
  var start = html.indexOf(HOME_START);
  var end = html.indexOf(HOME_END);

  if (start === -1 || end === -1) {
    throw new Error('index.html is missing the BLOG:LATEST markers');
  }

  var next = html.slice(0, start + HOME_START.length) +
    homeBlock(posts) +
    html.slice(end);

  if (next !== html) fs.writeFileSync(file, next);
  return next !== html;
}

// ---------------------------------------------------------------------------
// Feed, sitemap, robots
// ---------------------------------------------------------------------------
//
// The feed's build date is the newest post's date rather than "now", so
// rebuilding without writing anything produces no diff.

function renderFeed(posts) {
  var latest = posts.length ? formatRfc822(posts[0].date) : formatRfc822(parseDate('2026-01-01'));

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE.title)} — Blog</title>
    <link>${SITE.url}/blog/</link>
    <description>${escapeXml(SITE.blogDescription)}</description>
    <language>en</language>
    <lastBuildDate>${latest}</lastBuildDate>
    <atom:link href="${SITE.url}/blog/feed.xml" rel="self" type="application/rss+xml"/>
${posts.map(function (post) {
  var url = SITE.url + '/blog/' + post.slug + '/';
  return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${formatRfc822(post.date)}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>`;
}).join('\n')}
  </channel>
</rss>
`;
}

var STATIC_PAGES = ['/', '/work/', '/blog/', '/beyond-work/', '/contact/'];

function renderSitemap(posts) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${STATIC_PAGES.map(function (page) {
  return '  <url><loc>' + SITE.url + page + '</loc></url>';
}).join('\n')}
${posts.map(function (post) {
  return '  <url><loc>' + SITE.url + '/blog/' + post.slug + '/</loc>' +
    '<lastmod>' + post.date.iso + '</lastmod></url>';
}).join('\n')}
</urlset>
`;
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

var written = [];
var removed = [];

function write(relative, contents) {
  var file = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  var previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (previous === contents) return;
  fs.writeFileSync(file, contents);
  written.push(relative);
}

// A post that is deleted or turned back into a draft must stop being served.
function pruneStalePosts(posts) {
  if (!fs.existsSync(BLOG_DIR)) return;
  var live = new Set(posts.map(function (post) { return post.slug; }));

  fs.readdirSync(BLOG_DIR, { withFileTypes: true }).forEach(function (entry) {
    if (!entry.isDirectory() || live.has(entry.name)) return;
    fs.rmSync(path.join(BLOG_DIR, entry.name), { recursive: true, force: true });
    removed.push('blog/' + entry.name + '/');
  });
}

function main() {
  var posts = readPosts();

  posts.forEach(function (post) {
    write(path.join('blog', post.slug, 'index.html'), renderPost(post));
  });

  pruneStalePosts(posts);

  write(path.join('blog', 'index.html'), renderIndex(posts));
  write(path.join('blog', 'feed.xml'), renderFeed(posts));
  write('sitemap.xml', renderSitemap(posts));
  write('robots.txt', renderRobots());

  if (updateHome(posts)) written.push('index.html');

  console.log(posts.length + ' post' + (posts.length === 1 ? '' : 's') + ' published.');
  if (written.length) {
    console.log('Wrote:');
    written.forEach(function (f) { console.log('  ' + f); });
  }
  if (removed.length) {
    console.log('Removed:');
    removed.forEach(function (f) { console.log('  ' + f); });
  }
  if (!written.length && !removed.length) console.log('Nothing changed.');
}

try {
  main();
} catch (error) {
  console.error('Build failed: ' + error.message);
  process.exit(1);
}
