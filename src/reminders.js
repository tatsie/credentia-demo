'use strict';
const { db } = require('./db');
const { loadCerts } = require('./domain');
const { sendMail } = require('./mailer');

const THRESHOLDS = [30, 60, 90, 120]; // days before renewal
const OVERDUE_EVERY_DAYS = 7;
const APP_URL = () => process.env.PUBLIC_URL || 'http://localhost:' + (process.env.PORT || 3000);

function fmt(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }

function compose(c, kind) {
  const first = c.person.split(' ')[0];
  const label = `${c.type_name}${c.jurisdiction && !c.type_name.includes(c.jurisdiction) ? ' (' + c.jurisdiction + ')' : ''}`;
  const overdue = kind === 'overdue';
  const subject = overdue
    ? `Action required: your ${label} renewal is overdue`
    : `Reminder: ${label} renews in ${c.days} day${c.days === 1 ? '' : 's'}`;
  const lines = [
    `Hi ${first},`, '',
    overdue
      ? `Our records show your ${label} reached its renewal date on ${fmt(c.expiry_date)} (${Math.abs(c.days)} days ago).`
      : `Your ${label} is due for renewal on ${fmt(c.expiry_date)}.`,
    '',
    `CE progress this cycle (${fmt(c.cycle_start)} – ${fmt(c.expiry_date)}):`,
    `  • Total hours: ${c.hours} of ${c.hours_required}${c.hoursShort ? ` (${c.hoursShort} outstanding)` : ' ✓'}`,
    c.ethics_required ? `  • Ethics hours: ${c.ethics} of ${c.ethics_required}${c.ethicsShort ? ` (${c.ethicsShort} outstanding)` : ' ✓'}` : null,
    '',
    c.complete ? 'Your CE hours are complete — please file the renewal with the issuing body and upload confirmation.' : 'Please complete the outstanding hours and upload your certificates.',
    '', `Open Credentia: ${APP_URL()}/licences/${c.id}`, '', '— Credentia compliance',
  ].filter(l => l !== null);
  return { subject, text: lines.join('\n') };
}

function adminEmails() { return db.prepare("SELECT email FROM users WHERE role='admin' AND active=1").all().map(r => r.email); }

function deliver(c, kind, triggeredBy, createdAt) {
  const { subject, text } = compose(c, kind);
  const escalate = kind === 'overdue' || kind === 'd30';
  const cc = escalate ? adminEmails().filter(e => e.toLowerCase() !== c.email.toLowerCase()).join(', ') : null;
  const outboxId = sendMail({ to: c.email, cc, subject, text, createdAt });
  db.prepare("INSERT INTO reminders(user_cert_id,user_id,cycle_expiry,kind,days_left,outbox_id,triggered_by,created_at) VALUES(?,?,?,?,?,?,?,COALESCE(?,datetime('now')))")
    .run(c.id, c.user_id, c.expiry_date, kind, c.days, outboxId, triggeredBy, createdAt || null);
}

/** Idempotent: safe to run as often as you like. Sends at most one message per threshold per cycle; overdue weekly. */
function runReminders(triggeredBy = 'scheduler') {
  let sent = 0;
  for (const c of loadCerts()) {
    if (!c.active) continue;
    if (c.days < 0) {
      const last = db.prepare("SELECT created_at FROM reminders WHERE user_cert_id=? AND cycle_expiry=? AND kind='overdue' ORDER BY id DESC LIMIT 1").get(c.id, c.expiry_date);
      if (!last || Date.now() - Date.parse(last.created_at.replace(' ', 'T') + 'Z') >= OVERDUE_EVERY_DAYS * 86400000) { deliver(c, 'overdue', triggeredBy); sent++; }
      continue;
    }
    const t = THRESHOLDS.find(t => c.days <= t);
    if (!t) continue;
    const exists = db.prepare('SELECT 1 FROM reminders WHERE user_cert_id=? AND cycle_expiry=? AND kind=?').get(c.id, c.expiry_date, 'd' + t);
    if (!exists) { deliver(c, 'd' + t, triggeredBy); sent++; }
  }
  return sent;
}

function sendManual(certId, triggeredBy) {
  const c = loadCerts({ id: certId })[0];
  if (!c) return false;
  deliver(c, c.days < 0 ? 'overdue' : 'manual', triggeredBy);
  return true;
}

const KIND_LABEL = { d120: '120 days', d90: '90 days', d60: '60 days', d30: '30 days', overdue: 'Overdue (weekly)', manual: 'Manual nudge' };
module.exports = { deliver, runReminders, sendManual, THRESHOLDS, KIND_LABEL };
