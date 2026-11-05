'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, UPLOADS, secret, audit, getSetting, setSetting } = require('./db');
const { loadCerts, todayISO, isISODate, addMonths, addDays, STATUS_LABEL, COLOR_LABEL, COLOR_HINT } = require('./domain');
const { runReminders, sendManual, KIND_LABEL, THRESHOLDS } = require('./reminders');
const { transportName } = require('./mailer');
const { html, raw } = require('./html');
const V = require('./views');
const { icon, badge, colorBadge, avatar, progress, fmtDate, fmtDateTime, relDays, n } = V;

const app = express();
const PORT = Number(process.env.PORT || 3000);
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: { useDefaults: true, directives: {
    'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"], 'frame-src': ["'self'"], 'object-src': ["'none'"], 'form-action': ["'self'"],
    'frame-ancestors': ["'self'"], 'base-uri': ["'none'"], 'upgrade-insecure-requests': null } },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' },
}));
app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); next(); });
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: false }));
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 50 }));

// ---------- sessions (SQLite store) ----------
class SqliteStore extends session.Store {
  constructor() {
    super();
    this.q = { get: db.prepare('SELECT sess FROM sessions WHERE sid=? AND expires>?'), set: db.prepare('INSERT INTO sessions(sid,sess,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expires=excluded.expires'), del: db.prepare('DELETE FROM sessions WHERE sid=?') };
    setInterval(() => db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now()), 3600e3).unref();
  }
  get(sid, cb) { try { const r = this.q.get.get(sid, Date.now()); cb(null, r ? JSON.parse(r.sess) : null); } catch (e) { cb(e); } }
  set(sid, sess, cb) { try { const exp = sess.cookie && sess.cookie.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 8 * 3600e3; this.q.set.run(sid, JSON.stringify(sess), exp); cb && cb(null); } catch (e) { cb && cb(e); } }
  destroy(sid, cb) { try { this.q.del.run(sid); cb && cb(null); } catch (e) { cb && cb(e); } }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}
app.use(session({
  name: 'credentia.sid', secret: secret(), store: new SqliteStore(), resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 8 * 3600e3 },
}));

// ---------- auth + csrf ----------
app.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrf = req.session.csrf;
  if (req.session.uid) {
    const u = db.prepare('SELECT id,email,name,role,title,office,active FROM users WHERE id=?').get(req.session.uid);
    if (u && u.active) req.user = u; else req.session.uid = null;
  }
  next();
});
function csrfOk(req) {
  const t = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const a = Buffer.from(String(t)), b = Buffer.from(req.session.csrf || '');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function verifyCsrf(req, res, next) { if (!csrfOk(req)) return res.status(403).send(String(V.errorPage(403, 'Your session form token was invalid or expired. Please go back, refresh and try again.'))); next(); }
app.use((req, res, next) => {
  if (req.method === 'POST' && !req.is('multipart/form-data')) return verifyCsrf(req, res, next);
  next(); // multipart routes verify after parsing (files are kept in memory until verified)
});
const requireAuth = (req, res, next) => req.user ? next() : res.redirect('/login');
const requireAdmin = (req, res, next) => (req.user && req.user.role === 'admin') ? next() : res.status(403).send(String(V.errorPage(403, 'You do not have access to this page.')));
const isAdmin = req => req.user.role === 'admin';
const canAccessUser = (req, uid) => isAdmin(req) || req.user.id === uid;

function flash(req, type, msg) { req.session.flash = { type, msg }; }
function render(req, res, opts) {
  const f = req.session.flash; delete req.session.flash;
  res.send(String(V.layout({ ...opts, user: req.user, csrf: res.locals.csrf, flash: f })));
}
const csrfField = res => html`<input type="hidden" name="_csrf" value="${res.locals.csrf}">`;
const notFound = res => res.status(404).send(String(V.errorPage(404, 'We couldn’t find that page or you don’t have access to it.')));

// ---------- login ----------
const failed = new Map(); // email -> {count, until}
const loginLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true,
  handler: (req, res) => res.status(429).send(String(loginPage(res, 'Too many sign-in attempts from your network. Please wait 15 minutes and try again.'))),
});
// Demo mode: one-click sign-in as sample accounts. OFF unless DEMO_MODE=1|true is set explicitly.
const DEMO_MODE = /^(1|true|yes|on)$/i.test(process.env.DEMO_MODE || '');
const DEMO_ACCOUNTS = [
  { key: 'admin', email: 'morgan.ellis@harborpine.example', role: 'admin', name: 'Morgan Ellis', title: 'Director of Operations', initials: 'ME' },
  { key: 'staff', email: 'daniel.okafor@harborpine.example', role: 'staff', name: 'Daniel Okafor', title: 'Senior Tax Manager', initials: 'DO' },
];
if (DEMO_MODE) console.log('DEMO_MODE is ON: one-click demo sign-in is enabled on /login. Never enable this for real client data.');
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

function loginPage(res, error, email = '') {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Credentia</title><link rel="icon" href="/favicon.svg"><script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head>
<body class="login-body"><div class="login">
<section class="login-art"><div class="art-grid"></div><div class="art-glow"></div>
<div class="art-in"><div class="brand lg">${V.logo()}<div><strong>Credentia</strong><span>CE &amp; licence compliance</span></div></div>
<div class="art-copy"><h2>Every licence current.<br><span>Every hour accounted for.</span></h2><p>Track every licence and certification across your firm — CPE certificates on file, staff status confirmations, and renewal reminders that send themselves.</p></div>
<div class="art-card"><div class="ac-row"><span class="badge b-current"><span class="dot"></span>Current</span><span class="ac-meta">CPA · California</span></div><div class="ac-h"><strong>74</strong><span>/ 80 hrs</span></div><progress class="pg pg-current" value="74" max="80"></progress><div class="ac-foot"><span>Ethics 4 / 4 ✓</span><span>Renews in 7 mo</span></div></div>
</div></section>
<section class="login-form"><div class="lf"><form method="post" action="/login" class="lf-in" autocomplete="on">
<div class="brand only-m">${V.logo()}<div><strong>Credentia</strong></div></div>
<h1>Sign in</h1><p class="muted">Welcome back. Use your firm account to continue.</p>
${error ? html`<div class="flash f-error">${icon('alert')}<span>${error}</span></div>` : ''}
<input type="hidden" name="_csrf" value="${res.locals.csrf}">
<label class="fld"><span>Work email</span><input type="email" name="email" value="${email}" required autocomplete="username" autofocus maxlength="200"></label>
<label class="fld"><span>Password</span><input type="password" name="password" required autocomplete="current-password" maxlength="200"></label>
<button class="btn primary wide" type="submit">Sign in ${icon('arrow')}</button>
<p class="fine">${icon('lock')} Encrypted session · Access is logged and role-restricted</p>
</form>
${DEMO_MODE ? html`<div class="demo-box"><div class="demo-sep"><span>Explore the demo</span></div>
<div class="demo-btns">${DEMO_ACCOUNTS.map(a => html`<form method="post" action="/demo-login"><input type="hidden" name="_csrf" value="${res.locals.csrf}"><input type="hidden" name="who" value="${a.key}">
<button class="demo-btn" type="submit"><span class="demo-av">${a.initials}</span><span class="demo-tx"><strong>View as ${a.role}</strong><small>${a.name} · ${a.title}</small></span>${icon('arrow')}</button></form>`)}</div>
<p class="fine">Demo mode · sample data for Harbor &amp; Pine, resets on restart</p></div>` : ''}</div></section></div><script src="/app.js"></script></body></html>`;
}

app.get('/login', (req, res) => { if (req.user) return res.redirect('/'); res.send(String(loginPage(res))); });
app.post('/login', loginLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
  const password = String(req.body.password || '').slice(0, 200);
  const lock = failed.get(email);
  if (lock && lock.until > Date.now()) return res.status(429).send(String(loginPage(res, 'This account is temporarily locked after repeated failed attempts. Try again in a few minutes.', email)));
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  const ok = await bcrypt.compare(password, u ? u.password_hash : DUMMY_HASH);
  if (!u || !ok || !u.active) {
    const f = failed.get(email) || { count: 0, until: 0 }; f.count++; if (f.count >= 5) { f.until = Date.now() + 10 * 60e3; f.count = 0; } failed.set(email, f);
    audit(u && u.id, 'login.failed', email, req.ip);
    return res.status(401).send(String(loginPage(res, 'Incorrect email or password.', email)));
  }
  failed.delete(email);
  req.session.regenerate(err => {
    if (err) return res.status(500).end();
    req.session.uid = u.id; req.session.csrf = crypto.randomBytes(32).toString('hex');
    db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
    audit(u.id, 'login.success', null, req.ip);
    req.session.save(() => res.redirect('/'));
  });
});
function startSession(req, res, u, action) {
  req.session.regenerate(err => {
    if (err) return res.status(500).end();
    req.session.uid = u.id; req.session.csrf = crypto.randomBytes(32).toString('hex');
    db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(u.id);
    audit(u.id, action, null, req.ip);
    req.session.save(() => res.redirect('/'));
  });
}
app.post('/demo-login', (req, res) => {
  if (!DEMO_MODE) return res.status(404).send(String(V.errorPage(404, 'Page not found.')));
  const a = DEMO_ACCOUNTS.find(x => x.key === req.body.who);
  const u = a && db.prepare('SELECT * FROM users WHERE email=? AND role=? AND active=1').get(a.email, a.role);
  if (!u) return res.status(400).send(String(loginPage(res, 'That demo account is not available.')));
  startSession(req, res, u, 'login.demo');
});
app.post('/logout', (req, res) => { const uid = req.user && req.user.id; req.session.destroy(() => { if (uid) audit(uid, 'logout'); res.clearCookie('credentia.sid'); res.redirect('/login'); }); });

app.use(requireAuth);

// ---------- helpers ----------
const certLabel = c => `${c.type_name}${c.jurisdiction && !c.type_name.includes(c.jurisdiction) ? ' · ' + c.jurisdiction : ''}`;
function kpi(label, value, sub, tone = '') { return html`<div class="kpi ${tone}"><span class="kpi-l">${label}</span><strong class="kpi-v">${value}</strong>${sub ? html`<span class="kpi-s">${sub}</span>` : ''}</div>`; }
function hoursCell(c) {
  return html`<div class="hc"><div class="hc-t"><span><strong>${n(c.hours)}</strong> / ${n(c.hours_required)} h</span>${c.ethics_required ? html`<span class="muted">Ethics ${n(c.ethics)}/${n(c.ethics_required)}</span>` : ''}</div>${progress(c.hours, c.hours_required, c.complete ? 'current' : c.status)}</div>`;
}
function emptyState(title, text, cta) { return html`<div class="empty">${icon('file', 'i big')}<strong>${title}</strong><p>${text}</p>${cta || ''}</div>`; }
function statusCounts(certs) { const s = { current: 0, due: 0, expired: 0 }; certs.forEach(c => s[c.status]++); return s; }
function colorCounts(certs) { const s = { green: 0, yellow: 0, red: 0 }; certs.forEach(c => { if (s[c.color] != null) s[c.color]++; }); return s; }
const pct = (a, b) => b ? Math.round((a / b) * 100) : 100;
function ceTable(entries, showPerson) {
  if (!entries.length) return emptyState('No CE credits logged', 'Completed courses and their certificates will appear here.', html`<a class="btn primary" href="/ce/new">${icon('upload')} Log CE</a>`);
  return html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${showPerson ? raw('<th>Person</th>') : ''}<th>Course</th><th>Completed</th><th class="num">Hours</th><th class="num">Ethics</th><th>Certificate</th></tr></thead><tbody>
${entries.map(e => html`<tr class="rowlink" data-href="/ce/${e.id}">${showPerson ? html`<td><div class="who">${avatar(e.person, 'sm')}<span>${e.person}</span></div></td>` : ''}<td><a href="/ce/${e.id}"><strong>${e.title}</strong></a><span class="sub">${[e.provider, e.field].filter(Boolean).join(' · ')}</span></td><td class="nowrap">${fmtDate(e.completed_date)}</td><td class="num">${n(e.hours)}</td><td class="num">${e.ethics_hours ? n(e.ethics_hours) : '—'}</td><td>${e.files ? html`<span class="pill ok">${icon('file')} On file</span>` : html`<span class="pill">Missing</span>`}</td></tr>`)}
</tbody></table></div>`;
}
module.exports = { app, db, fs, path, crypto, bcrypt, multer, UPLOADS, audit, getSetting, setSetting, loadCerts, todayISO, isISODate, addMonths, addDays, STATUS_LABEL, COLOR_LABEL, COLOR_HINT, runReminders, sendManual, KIND_LABEL, THRESHOLDS, transportName, html, raw, V, icon, badge, colorBadge, avatar, progress, fmtDate, fmtDateTime, relDays, n, requireAdmin, isAdmin, canAccessUser, flash, render, csrfField, notFound, verifyCsrf, certLabel, kpi, hoursCell, emptyState, statusCounts, colorCounts, pct, ceTable };
