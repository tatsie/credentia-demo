'use strict';
module.exports = (X) => {
  const { app, db, loadCerts, todayISO, addMonths, THRESHOLDS, html, V, icon, badge, colorBadge, avatar, fmtDate, fmtDateTime, relDays, n, isAdmin, render, csrfField, flash, audit, certLabel, kpi, hoursCell, emptyState, statusCounts, colorCounts, pct, ceTable, progress, COLOR_LABEL } = X;

  app.get('/', (req, res) => isAdmin(req) ? adminDash(req, res) : staffDash(req, res));

  function adminDash(req, res) {
    const certs = loadCerts().filter(c => c.active);
    const people = db.prepare('SELECT COUNT(*) c FROM users WHERE active=1').get().c;
    const s = statusCounts(certs);
    const colors = colorCounts(certs);
    const year = todayISO().slice(0, 4);
    const hoursYear = db.prepare('SELECT COALESCE(SUM(hours),0) h FROM ce_entries WHERE substr(completed_date,1,4)=?').get(year).h;
    const outstanding = certs.filter(c => c.status !== 'expired').reduce((a, c) => a + c.hoursShort, 0);
    const upcoming = certs.filter(c => c.days <= 120).sort((a, b) => a.days - b.days).slice(0, 8);
    const missing = certs.filter(c => !c.complete && c.days >= 0 && c.days <= 365 && c.color !== 'yellow').sort((a, b) => (b.hoursShort + b.ethicsShort) - (a.hoursShort + a.ethicsShort)).slice(0, 6);
    const t = todayISO(); const months = [];
    for (let i = 0; i < 12; i++) { const m = addMonths(t.slice(0, 7) + '-01', i).slice(0, 7); months.push({ key: m, label: new Date(m + '-01T00:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }), value: 0 }); }
    certs.forEach(c => { const m = months.find(x => x.key === c.expiry_date.slice(0, 7)); if (m) m.value++; });
    months[0].hi = true;
    const byType = {};
    certs.forEach(c => { const k = c.code; byType[k] = byType[k] || { name: c.type_name, code: k, total: 0, green: 0, yellow: 0, red: 0, hours: 0, req: 0 }; const b = byType[k]; b.total++; b[c.color]++; b.hours += Math.min(c.hours, c.hours_required); b.req += c.hours_required; });
    const recent = db.prepare('SELECT e.*, u.name person, (SELECT COUNT(*) FROM files f WHERE f.ce_entry_id=e.id) files FROM ce_entries e JOIN users u ON u.id=e.user_id ORDER BY e.created_at DESC, e.id DESC LIMIT 6').all();
    const remCount = db.prepare("SELECT COUNT(*) c FROM reminders WHERE created_at >= datetime('now','-30 days')").get().c;
    const users = db.prepare('SELECT id,name,office,active FROM users WHERE active=1 AND role<>\'\' ORDER BY name').all();
    const attestLatest = Object.fromEntries(db.prepare('SELECT user_id, MAX(confirmed_at) confirmed_at FROM attestations GROUP BY user_id').all().map(r => [r.user_id, r.confirmed_at]));
    const matrixPeople = users.filter(u => certs.some(c => c.user_id === u.id)).map(u => {
      const mine = certs.filter(c => c.user_id === u.id);
      return { ...u, green: mine.filter(c => c.color === 'green').length, yellow: mine.filter(c => c.color === 'yellow').length, red: mine.filter(c => c.color === 'red').length, total: mine.length, attested: attestLatest[u.id] || null, certs: mine };
    });

    const body = html`
<section class="kpis">
${kpi('Compliant (green)', colors.green, `${pct(colors.green, certs.length)}% of licences`, 'accent')}
${kpi('Info needed (yellow)', colors.yellow, 'licence held — status unknown', colors.yellow ? 'warn' : '')}
${kpi('Working toward (red)', colors.red, 'not compliant yet', colors.red ? 'bad' : '')}
${kpi(`CE hours logged · ${year}`, n(hoursYear), `across ${people} people`)}
${kpi('Hours outstanding', n(outstanding), 'open cycles, firm-wide')}
</section>
<section class="grid g-3-2">
<div class="card flush"><div class="card-h pad"><div><h2>Compliance matrix</h2><p>Green = compliant · Yellow = held, no renewal info · Red = not compliant, being worked toward</p></div><a class="btn ghost sm" href="/reports/cpe-folder.zip">${icon('folder')} Export CPE folder</a></div>
${matrixPeople.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th class="num">Green</th><th class="num">Yellow</th><th class="num">Red</th><th class="num">Total</th><th>Status confirm</th><th>Standing</th></tr></thead><tbody>
${matrixPeople.map(p => {
  const worst = p.red ? 'red' : p.yellow ? 'yellow' : 'green';
  return html`<tr class="rowlink" data-href="/people/${p.id}"><td><div class="who">${avatar(p.name, 'sm')}<span><a href="/people/${p.id}"><strong>${p.name}</strong></a><span class="sub">${p.office || ''}</span></span></div></td><td class="num t-ok">${p.green || '—'}</td><td class="num t-warn">${p.yellow || '—'}</td><td class="num t-bad">${p.red || '—'}</td><td class="num">${p.total}</td><td class="muted nowrap">${p.attested ? fmtDateTime(p.attested) : html`<span class="pill warn">Not confirmed</span>`}</td><td>${colorBadge(worst)}</td></tr>`;
})}</tbody></table></div>` : emptyState('No licences yet', 'Add people and licences to build the matrix.')}
</div>
<div class="card"><div class="card-h"><div><h2>Colour mix</h2><p>${certs.length} active credentials</p></div></div>
<div class="donut-wrap">${V.donut([{ value: colors.green, cls: 's-current' }, { value: colors.yellow, cls: 's-due' }, { value: colors.red, cls: 's-expired' }], pct(colors.green, certs.length) + '%', 'green')}
<ul class="legend"><li><span class="dot d-current"></span>Compliant<strong>${colors.green}</strong></li><li><span class="dot d-due"></span>Info needed<strong>${colors.yellow}</strong></li><li><span class="dot d-expired"></span>Working toward<strong>${colors.red}</strong></li></ul></div></div>
</section>
<section class="grid g-3-2">
<div class="card"><div class="card-h"><div><h2>Renewals over the next 12 months</h2><p>Licences reaching their renewal date each month</p></div></div><div class="chart">${V.barsChart(months)}</div></div>
<div class="card"><div class="card-h"><div><h2>Renewal timing</h2><p>Current / due soon / expired (separate from colour status)</p></div></div>
<div class="donut-wrap">${V.donut([{ value: s.current, cls: 's-current' }, { value: s.due, cls: 's-due' }, { value: s.expired, cls: 's-expired' }], pct(s.current, certs.length) + '%', 'on time')}
<ul class="legend"><li><span class="dot d-current"></span>Current<strong>${s.current}</strong></li><li><span class="dot d-due"></span>Due soon<strong>${s.due}</strong></li><li><span class="dot d-expired"></span>Expired<strong>${s.expired}</strong></li></ul></div></div>
</section>
<section class="grid g-2-1">
<div class="card flush"><div class="card-h pad"><div><h2>Upcoming &amp; overdue renewals</h2><p>Next 120 days — reminders go out at ${THRESHOLDS.slice().reverse().join(' / ')} days, then weekly if overdue</p></div><a class="btn ghost sm" href="/licences?status=due">View all ${icon('arrow')}</a></div>
${upcoming.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Credential</th><th>Renews</th><th class="w-hours">CE hours</th><th>Colour</th><th>Timing</th></tr></thead><tbody>
${upcoming.map(c => html`<tr class="rowlink" data-href="/licences/${c.id}"><td><div class="who">${avatar(c.person, 'sm')}<span>${c.person}</span></div></td><td><a href="/licences/${c.id}">${certLabel(c)}</a></td><td><span class="nowrap">${fmtDate(c.expiry_date)}</span><span class="sub ${c.days < 0 ? 't-bad' : ''}">${relDays(c.days)}</span></td><td>${hoursCell(c)}</td><td>${colorBadge(c)}</td><td>${badge(c.status)}</td></tr>`)}
</tbody></table></div>` : emptyState('Nothing due', 'No renewals in the next 120 days.')}
</div>
<div class="card"><div class="card-h"><div><h2>Missing hours</h2><p>Largest shortfalls on cycles ending within a year</p></div></div>
${missing.length ? html`<ul class="list">${missing.map(c => html`<li><a href="/licences/${c.id}" class="li-a">${avatar(c.person, 'sm')}<div class="li-m"><strong>${c.person}</strong><span>${certLabel(c)} · ${relDays(c.days)}</span></div><div class="li-r"><strong class="t-warn">${n(c.hoursShort)} h</strong>${c.ethicsShort ? html`<span>+${n(c.ethicsShort)} ethics</span>` : html`<span>to go</span>`}</div></a></li>`)}</ul>` : emptyState('All caught up', 'Every open cycle has its hours.')}
</div></section>
<section class="grid g-3-2">
<div class="card flush"><div class="card-h pad"><div><h2>Compliance by credential</h2><p>Colour mix and hours earned against requirement</p></div><a class="btn ghost sm" href="/reports/compliance.csv">${icon('csv')} Export CSV</a></div>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Credential</th><th class="num">Holders</th><th class="num">Green</th><th class="num">Yellow</th><th class="num">Red</th><th class="w-hours">Hours earned</th></tr></thead><tbody>
${Object.values(byType).sort((a, b) => b.total - a.total).map(b => html`<tr><td><span class="code">${b.code}</span> ${b.name}</td><td class="num">${b.total}</td><td class="num t-ok">${b.green}</td><td class="num t-warn">${b.yellow}</td><td class="num t-bad">${b.red}</td><td><div class="hc"><div class="hc-t"><span>${pct(b.hours, b.req)}%</span><span class="muted">${n(b.hours)} / ${n(b.req)} h</span></div>${progress(b.hours, b.req, 'accent')}</div></td></tr>`)}
</tbody></table></div></div>
<div class="card"><div class="card-h"><div><h2>Recent CE activity</h2><p>${remCount} reminder${remCount === 1 ? '' : 's'} sent in the last 30 days</p></div></div>
<ul class="feed">${recent.map(e => html`<li><a href="/ce/${e.id}"><span class="feed-ic">${icon(e.files ? 'file' : 'ce')}</span><div><strong>${e.title}</strong><span>${e.person} · ${n(e.hours)} h · ${fmtDate(e.completed_date)}</span></div></a></li>`)}</ul>
</div></section>`;
    render(req, res, { title: 'Overview', subtitle: `Firm-wide CE and licence compliance · ${fmtDate(todayISO())}`, active: '/', body,
      actions: html`<a class="btn ghost" href="/reports/cpe-folder.zip">${icon('folder')}<span class="hide-s">CPE folder</span></a><a class="btn ghost" href="/ce/new">${icon('upload')}<span class="hide-s">Log CE</span></a><a class="btn primary" href="/licences/new">${icon('plus')}<span class="hide-s">Add licence</span></a>` });
  }

  function staffDash(req, res) {
    const certs = loadCerts({ userId: req.user.id });
    const s = statusCounts(certs);
    const colors = colorCounts(certs);
    const next = certs.filter(c => c.days >= 0).sort((a, b) => a.days - b.days)[0];
    const entries = db.prepare('SELECT e.*, (SELECT COUNT(*) FROM files f WHERE f.ce_entry_id=e.id) files FROM ce_entries e WHERE user_id=? ORDER BY completed_date DESC LIMIT 6').all(req.user.id);
    const fileCount = db.prepare('SELECT COUNT(*) c FROM files WHERE user_id=?').get(req.user.id).c;
    const hoursYear = db.prepare('SELECT COALESCE(SUM(hours),0) h FROM ce_entries WHERE user_id=? AND substr(completed_date,1,4)=?').get(req.user.id, todayISO().slice(0, 4)).h;
    const first = req.user.name.split(' ')[0];
    const lastAttest = db.prepare('SELECT * FROM attestations WHERE user_id=? ORDER BY confirmed_at DESC LIMIT 1').get(req.user.id);
    const msg = colors.red ? `${colors.red} licence${colors.red > 1 ? 's are' : ' is'} not yet compliant.` : colors.yellow ? `${colors.yellow} licence${colors.yellow > 1 ? 's need' : ' needs'} renewal information.` : 'You’re fully compliant. Nice work.';
    const ATTACH_STMT = 'I confirm that I have submitted my CPE completion certificates and that the licences and certifications listed for me in Credentia accurately reflect my current status.';
    const body = html`
<section class="hero card"><div><h2>Hi ${first} — ${msg}</h2><p class="muted">Log courses as you complete them, upload the certificate, and confirm your status for PCAOB / AICPA compliance. We’ll remind you ${THRESHOLDS.slice().reverse().join(', ')} days before each renewal.</p></div><a class="btn primary" href="/ce/new">${icon('upload')} Log CE &amp; upload certificate</a></section>
<section class="kpis k4">
${kpi('Licences', certs.length, `${colors.green} green · ${colors.yellow} yellow · ${colors.red} red`)}
${kpi('Next renewal', next ? relDays(next.days).replace('in ', '') : '—', next ? certLabel(next) : 'none scheduled', next && next.days <= 90 ? 'warn' : '')}
${kpi(`CE hours · ${todayISO().slice(0, 4)}`, n(hoursYear), `${entries.length ? 'last: ' + fmtDate(entries[0].completed_date) : 'none yet'}`)}
${kpi('Certificates on file', fileCount, 'stored securely')}
</section>
<div class="card attest">${lastAttest
  ? html`<div class="attest-ok">${icon('shield')}<div><strong>Status confirmed</strong><p class="muted">You confirmed on ${fmtDateTime(lastAttest.confirmed_at)}. Confirm again after new CPE or licence changes.</p></div>
<form method="post" action="/attest">${csrfField(res)}<input type="hidden" name="statement" value="${ATTACH_STMT}"><button class="btn ghost">Confirm again</button></form></div>`
  : html`<div class="attest-need">${icon('shield')}<div><strong>Confirm your CPE &amp; licence status</strong><p class="muted">Required for PCAOB-regulated and AICPA accounting and auditing engagements. This records your confirmation with a timestamp in the audit log.</p>
<label class="chk"><input type="checkbox" name="agree" form="attestForm" value="1" required> ${ATTACH_STMT}</label></div>
<form id="attestForm" method="post" action="/attest">${csrfField(res)}<input type="hidden" name="statement" value="${ATTACH_STMT}"><button class="btn primary">Confirm status</button></form></div>`}
</div>
<h3 class="sec-t">My licences &amp; certifications</h3>
<section class="lic-grid">${certs.length ? certs.map(c => licCard(c)) : emptyState('No licences yet', 'Add your first licence or certification to start tracking.', html`<a class="btn primary" href="/licences/new">${icon('plus')} Add licence</a>`)}</section>
<div class="card flush"><div class="card-h pad"><div><h2>Recent CE credits</h2></div><a class="btn ghost sm" href="/ce">View all ${icon('arrow')}</a></div>${ceTable(entries, false)}</div>`;
    render(req, res, { title: 'My compliance', active: '/', body, actions: html`<a class="btn ghost" href="/licences/new">${icon('plus')}<span class="hide-s">Add licence</span></a>` });
  }

  function licCard(c) {
    return html`<a class="card lic" href="/licences/${c.id}">
<div class="lic-h"><span class="code">${c.code}</span>${colorBadge(c)}</div>
<strong class="lic-n">${c.type_name}</strong><span class="muted">${c.jurisdiction || c.issuer || ''}${c.licence_number ? ' · #' + c.licence_number : ''}</span>
<div class="lic-hours"><strong>${n(c.hours)}</strong><span>/ ${n(c.hours_required)} hours</span></div>${progress(c.hours, c.hours_required, c.complete ? 'current' : c.status)}
<div class="lic-f"><span>${badge(c.status)} · ${c.ethics_required ? `Ethics ${n(c.ethics)}/${n(c.ethics_required)}${c.ethicsShort ? '' : ' ✓'}` : 'No ethics requirement'}</span><span class="${c.days < 0 ? 't-bad' : c.days <= 90 ? 't-warn' : ''}">${c.days < 0 ? 'Expired ' + fmtDate(c.expiry_date) : 'Renews ' + fmtDate(c.expiry_date)}</span></div></a>`;
  }
  X.licCard = licCard;

  // Staff (and admin) status attestation — PCAOB / AICPA confirm-status requirement
  app.post('/attest', (req, res) => {
    const statement = String(req.body.statement || '').trim().slice(0, 500);
    if (statement.length < 20) { flash(req, 'error', 'Confirmation statement is required.'); return res.redirect('/'); }
    const at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('INSERT INTO attestations(user_id,statement,confirmed_at,ip) VALUES(?,?,?,?)').run(req.user.id, statement, at, req.ip);
    audit(req.user.id, 'attest.confirm', statement.slice(0, 200), req.ip);
    flash(req, 'ok', 'Thank you — your CPE and licence status confirmation has been recorded.');
    res.redirect('/');
  });
};
