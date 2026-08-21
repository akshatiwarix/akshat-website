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

  var nameField = form.querySelector('[name="name"]');
  var authorName = root.getAttribute('data-author') || 'Author';

  var replyingTo = null;

  // Set by a successful post, consumed by the next render(): the comment that
  // just landed gets a one-shot entrance, so a reader sees their own words
  // arrive instead of teleporting into a fully re-rendered list.
  var enterId = null;

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

  // Signed in as the author, the name field is a question with one answer, so
  // stop asking it. The name still travels with every comment — it is supplied
  // here rather than typed.
  function applyAuthorChrome() {
    var isAuthor = Boolean(token());
    nameField.hidden = isAuthor;
    nameField.required = !isAuthor;
    var label = form.querySelector('label[for="' + nameField.id + '"]');
    if (label) label.hidden = isAuthor;
  }

  // ---------- time ----------

  function plural(n, unit) {
    return n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
  }

  function ago(ts) {
    var seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return plural(Math.floor(seconds / 60), 'minute');
    if (seconds < 86400) return plural(Math.floor(seconds / 3600), 'hour');
    if (seconds < 2592000) return plural(Math.floor(seconds / 86400), 'day');
    return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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

    // A paragraph per blank-line-separated block, so a long comment reads like
    // the post above it.
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

    if (enterId !== null) {
      var entered = document.getElementById('comment-' + enterId) ||
                    list.lastElementChild;
      if (entered) entered.classList.add('comment-enter');
      enterId = null;
    }
  }

  // ---------- reply ----------

  // Replying moves the one form under the comment being answered, so there is
  // never a second form on the page to keep in sync. The move is bridged by a
  // quick fade so the form doesn't vanish and reappear elsewhere.
  function moveForm(parent, before) {
    form.classList.add('is-moving');
    window.setTimeout(function () {
      if (before) parent.insertBefore(form, before);
      else parent.appendChild(form);
      form.classList.remove('is-moving');
    }, 130);
  }

  function startReply(comment, item) {
    replyingTo = comment.id;
    moveForm(item, null);
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
    moveForm(root.querySelector('.prose'), list);
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

    var authoring = Boolean(token());
    var name = authoring ? authorName : nameField.value;
    var body = form.querySelector('.comment-body').value;
    var submit = form.querySelector('.btn');

    if (!body.trim()) {
      setStatus(authoring ? 'Write something first.' : 'A name and a comment, please.', true);
      return;
    }

    if (!authoring && !name.trim()) {
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

      // Only the body is cleared: the name is worth keeping for a second
      // comment, and on failure nothing is cleared at all, so no typing is lost.
      form.querySelector('.comment-body').value = '';
      endReply();
      setStatus('Posted.', false);
      enterId = data.id;
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

  // The pop runs once per click, not once per page load for everyone who has
  // already liked the post, so it rides a class that only the click adds.
  likeButton.addEventListener('animationend', function () {
    likeButton.classList.remove('just-liked');
  });

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
      likeButton.classList.add('just-liked');
    } catch (err) {
      setStatus('That like did not save.', true);
    } finally {
      likeButton.disabled = false;
    }
  });

  applyAuthorChrome();
  load();
  loadLikes();
}());
