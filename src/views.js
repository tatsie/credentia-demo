'use strict';
const { html, raw } = require('./html');
const { STATUS_LABEL, COLOR_LABEL, COLOR_HINT } = require('./domain');

const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  licence: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  ce: '<path d="M2 4.5h6a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2z"/><path d="M22 4.5h-6a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h7z"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  catalog: '<path d="m12 2.5 9.5 4.8-9.5 4.8-9.5-4.8z"/><path d="m2.5 16.7 9.5 4.8 9.5-4.8"/><path d="m2.5 12 9.5 4.8 9.5-4.8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2.5"/><path d="m22 7-10 6L2 7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  csv: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
};
const icon = (n, cls = 'i') => raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`);
const logo = () => raw(`<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b8bff"/><stop offset="1" stop-color="#5046e5"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#lg)"/><path d="M21.5 11.2a7 7 0 1 0 0 9.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="m13.2 16 2.3 2.3 4.4-4.6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`);

function fmtDate(iso) {
  if (!iso) return '—';
  const d = iso.length > 10 ? new Date(iso.replace(' ', 'T') + 'Z') : new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
function fmtDateTime(s) { if (!s) return '—'; const d = new Date(s.replace(' ', 'T') + 'Z'); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: process.env.DISPLAY_TZ || 'America/New_York', timeZoneName: 'short' }); }
function relDays(d) {
  if (d === 0) return 'today';
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d < 60) return `in ${d}d`;
  if (d < 730) return `in ${Math.round(d / 30.4)} mo`;
  return `in ${(d / 365).toFixed(1)} yr`;
}
const n = x => (Math.round(x * 10) / 10).toString();
const badge = s => html`<span class="badge b-${s}"><span class="dot"></span>${STATUS_LABEL[s]}</span>`;
const colorBadge = c => {
  const color = typeof c === 'string' ? c : c.color;
  return html`<span class="badge b-${color}" title="${COLOR_HINT[color] || ''}"><span class="dot"></span>${COLOR_LABEL[color] || color}</span>`;
};
const initials = name => name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
const avatar = (name, cls = '') => html`<span class="avatar ${cls}" data-hue="${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 6}">${initials(name)}</span>`;
const progress = (value, max, status) => html`<progress class="pg pg-${status}" value="${Math.min(value, max || 1)}" max="${max || 1}"></progress>`;

function donut(parts, centerTop, centerBottom) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let offset = 25; const C = 100;
  const segs = parts.filter(p => p.value > 0).map(p => {
    const len = (p.value / total) * C;
    const gap = parts.filter(x => x.value > 0).length > 1 ? 0.8 : 0;
    const s = `<circle class="seg ${p.cls}" cx="21" cy="21" r="15.9155" fill="none" stroke-width="4.2" stroke-dasharray="${Math.max(0, len - gap)} ${C - Math.max(0, len - gap)}" stroke-dashoffset="${offset}" stroke-linecap="round"/>`;
    offset -= len; return s;
  }).join('');
  return html`<div class="donut"><svg viewBox="0 0 42 42">${raw('<circle class="track" cx="21" cy="21" r="15.9155" fill="none" stroke-width="4.2"/>' + segs)}</svg><div class="donut-c"><strong>${centerTop}</strong><span>${centerBottom}</span></div></div>`;
}

function barsChart(items) { // [{label, value, hi}]
  const W = 640, H = 220, top = 22, bottom = 26, max = Math.max(1, ...items.map(i => i.value));
  const w = W / items.length, ch = H - top - bottom;
  const grid = [0, 0.5, 1].map(f => `<line class="gl" x1="0" x2="${W}" y1="${(top + ch * (1 - f)).toFixed(1)}" y2="${(top + ch * (1 - f)).toFixed(1)}"/>`).join('');
  const bars = items.map((it, i) => {
    const h = Math.max((it.value / max) * ch, it.value ? 4 : 2); const x = i * w + w * 0.22, y = top + ch - h;
    return `<g class="bar-g${it.hi ? ' hi' : ''}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(w * 0.56).toFixed(1)}" height="${h.toFixed(1)}" rx="5"/>${it.value ? `<text x="${(i * w + w / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}" text-anchor="middle" class="bv">${it.value}</text>` : ''}<text x="${(i * w + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="bl">${it.label}</text></g>`;
  }).join('');
  return raw(`<svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Renewals per month">${grid}${bars}</svg>`);
}

function nav(user, active) {
  const items = user.role === 'admin'
    ? [['dashboard', '/', 'Overview'], ['licence', '/licences', 'Licences'], ['ce', '/ce', 'CE credits'], ['people', '/people', 'People'], ['catalog', '/catalog', 'Credential catalog'], ['bell', '/reminders', 'Reminders'], ['mail', '/outbox', 'Outbox'], ['folder', '/settings', 'Settings']]
    : [['dashboard', '/', 'My compliance'], ['licence', '/licences', 'My licences'], ['ce', '/ce', 'My CE credits']];
  return items.map(([ic, href, label]) => html`<a href="${href}" class="nav-a${active === href ? ' on' : ''}">${icon(ic)}<span>${label}</span></a>`);
}

function layout({ title, user, csrf, active, body, actions, flash, subtitle }) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Credentia</title><link rel="icon" href="/favicon.svg"><link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin>
<script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head>
<body><div class="shell">
<aside class="side" id="side"><div class="brand">${logo()}<div><strong>Credentia</strong><span>Harbor &amp; Pine CPAs</span></div></div>
<nav class="nav">${nav(user, active)}</nav>
<div class="side-foot">
<a href="/account" class="me${active === '/account' ? ' on' : ''}">${avatar(user.name, 'sm')}<span><strong>${user.name}</strong><em>${user.role === 'admin' ? 'Administrator' : 'Staff'}</em></span></a>
<form method="post" action="/logout"><input type="hidden" name="_csrf" value="${csrf}"><button class="icon-btn" title="Sign out" aria-label="Sign out">${icon('logout')}</button></form>
</div></aside>
<div class="scrim" id="scrim"></div>
<main class="main"><header class="top"><button class="icon-btn only-m" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
<div class="top-t"><h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
<div class="top-a">${actions || ''}<button class="icon-btn" id="themeBtn" aria-label="Toggle theme">${icon('sun', 'i t-sun')}${icon('moon', 'i t-moon')}</button></div></header>
${flash ? html`<div class="flash f-${flash.type}">${icon(flash.type === 'error' ? 'alert' : 'check')}<span>${flash.msg}</span></div>` : ''}
<div class="content">${body}</div></main></div><script src="/app.js"></script></body></html>`;
}

function errorPage(code, msg) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${code} · Credentia</title><script src="/theme.js"></script><link rel="stylesheet" href="/app.css"></head><body class="center-page"><div class="err-card">${logo()}<h1>${code}</h1><p>${msg}</p><a class="btn" href="/">Back to Credentia</a></div></body></html>`;
}

module.exports = { layout, icon, logo, badge, colorBadge, avatar, progress, donut, barsChart, fmtDate, fmtDateTime, relDays, n, errorPage, COLOR_LABEL, COLOR_HINT };
