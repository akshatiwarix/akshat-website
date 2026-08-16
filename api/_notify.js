// The only file that speaks Resend. Everything here is best-effort: the comment
// is already saved by the time this runs, and a reader must never see an error
// because a notification did not send.
'use strict';

var SITE = 'https://www.akshatiwari.com';

// Resend's sandbox sender needs no verified domain as long as the recipient is
// the account owner. Verifying a domain later changes this one line.
var FROM = 'Blog comments <onboarding@resend.dev>';

// The recipient has to match the Resend account, so it is an env var rather than
// a constant: the site's public address and the account's may differ.
function recipient() {
  return process.env.NOTIFY_EMAIL || 'pi4akshat@gmail.com';
}

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
        to: [recipient()],
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
