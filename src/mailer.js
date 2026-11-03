'use strict';
const { db } = require('./db');
let transporter = null;
if (process.env.SMTP_HOST) {
  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}
const FROM = process.env.MAIL_FROM || 'Credentia <no-reply@credentia.local>';

function transportName() { return transporter ? 'smtp' : 'outbox'; }

/** Records the message in the outbox (always) and delivers via SMTP when configured. Returns outbox id. */
function sendMail({ to, cc, subject, text, createdAt }) {
  const transport = transportName();
  if (createdAt) { // historical/backfilled record (seed data) — never delivered
    return db.prepare('INSERT INTO outbox(to_email,cc,subject,body_text,transport,status,created_at) VALUES(?,?,?,?,?,?,?)').run(to, cc || null, subject, text, 'outbox', 'logged', createdAt).lastInsertRowid;
  }
  const id = db.prepare('INSERT INTO outbox(to_email,cc,subject,body_text,transport,status) VALUES(?,?,?,?,?,?)')
    .run(to, cc || null, subject, text, transport, transport === 'smtp' ? 'queued' : 'logged').lastInsertRowid;
  if (transporter) {
    transporter.sendMail({ from: FROM, to, cc: cc || undefined, subject, text })
      .then(() => db.prepare("UPDATE outbox SET status='sent' WHERE id=?").run(id))
      .catch(err => db.prepare("UPDATE outbox SET status='failed', error=? WHERE id=?").run(String(err.message).slice(0, 500), id));
  } else {
    console.log(`[mail:outbox] #${id} to=${to}${cc ? ' cc=' + cc : ''} subject="${subject}"`);
  }
  return id;
}
module.exports = { sendMail, transportName };
