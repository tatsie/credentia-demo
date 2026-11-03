'use strict';
module.exports = (X) => {
  const { app, db, loadCerts, todayISO, isISODate, addDays, THRESHOLDS, KIND_LABEL, sendManual, transportName, audit, html, raw, icon, badge, avatar, progress, fmtDate, fmtDateTime, relDays, n, isAdmin, canAccessUser, requireAdmin, flash, render, csrfField, notFound, certLabel, hoursCell, emptyState, statusCounts, ceTable } = X;

  app.get('/licences', (req, res) => {
    const admin = isAdmin(req);
    let certs = admin ? loadCerts().filter(c => c.active) : loadCerts({ userId: req.user.id });
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
    const status = ['current', 'due', 'expired'].includes(req.query.status) ? req.query.status : '';
    const type = String(req.query.type || '').slice(0, 20);
    const all = certs;
    if (q) certs = certs.filter(c => [c.person, c.type_name, c.code, c.jurisdiction, c.licence_number].join(' ').toLowerCase().includes(q));
    if (status) certs = certs.filter(c => c.status === status);
    if (type) certs = certs.filter(c => c.code === type);
    const types = db.prepare('SELECT code,name FROM cert_types ORDER BY name').all();
    const s = statusCounts(all);
    const qs = st => { const p = new URLSearchParams(); if (st) p.set('status', st); if (type) p.set('type', type); if (q) p.set('q', q); const x = p.toString(); return x ? '?' + x : '/licences'; };
    const tab = (st, label, count) => html`<a class="seg-a${status === st ? ' on' : ''}" href="${qs(st)}">${label}<span>${count}</span></a>`;
    const body = html`
<div class="toolbar"><nav class="seg">${tab('', 'All', all.length)}${tab('current', 'Current', s.current)}${tab('due', 'Due soon', s.due)}${tab('expired', 'Expired', s.expired)}</nav>
<form class="filters" method="get">${status ? html`<input type="hidden" name="status" value="${status}">` : ''}
<label class="search">${icon('search')}<input name="q" value="${q}" placeholder="${admin ? 'Search people, credentials, states…' : 'Search…'}"></label>
<select name="type" class="sel auto-submit"><option value="">All credentials</option>${types.map(t => html`<option value="${t.code}"${t.code === type ? raw(' selected') : ''}>${t.name}</option>`)}</select></form></div>
<div class="card flush">${certs.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${admin ? raw('<th>Person</th>') : ''}<th>Credential</th><th>Licence #</th><th>Cycle start</th><th>Renews</th><th class="w-hours">CE hours</th><th>Status</th></tr></thead><tbody>
${certs.map(c => html`<tr class="rowlink" data-href="/licences/${c.id}">${admin ? html`<td><div class="who">${avatar(c.person, 'sm')}<span>${c.person}</span></div></td>` : ''}<td><a href="/licences/${c.id}"><span class="code">${c.code}</span> ${c.type_name}</a><span class="sub">${c.jurisdiction || c.issuer || ''}</span></td><td class="mono">${c.licence_number || '—'}</td><td class="nowrap muted">${fmtDate(c.cycle_start)}</td><td><span class="nowrap">${fmtDate(c.expiry_date)}</span><span class="sub ${c.days < 0 ? 't-bad' : c.days <= 90 ? 't-warn' : ''}">${relDays(c.days)}</span></td><td>${hoursCell(c)}</td><td>${badge(c.status)}</td></tr>`)}
</tbody></table></div>` : emptyState('No matching licences', 'Try a different filter or add a licence.')}</div>`;
    render(req, res, { title: admin ? 'Licences & certifications' : 'My licences', subtitle: `${all.length} tracked`, active: '/licences', body,
      actions: html`${admin ? html`<a class="btn ghost" href="/reports/compliance.csv">${icon('csv')}<span class="hide-s">Export</span></a>` : ''}<a class="btn primary" href="/licences/new">${icon('plus')}<span class="hide-s">Add licence</span></a>` });
  });

  function licenceForm(req, res, c, errors) {
    const types = db.prepare('SELECT * FROM cert_types ORDER BY name').all();
    const people = isAdmin(req) ? db.prepare('SELECT id,name FROM users WHERE active=1 ORDER BY name').all() : [];
    const v = c || { cycle_start: todayISO(), user_id: req.user.id };
    const body = html`<form class="card form narrow" method="post" action="${c && c.id ? `/licences/${c.id}` : '/licences'}">${csrfField(res)}
${errors ? html`<div class="flash f-error">${icon('alert')}<span>${errors}</span></div>` : ''}
${isAdmin(req) ? html`<label class="fld"><span>Person</span><select name="user_id" required>${people.map(p => html`<option value="${p.id}"${p.id === Number(v.user_id) ? raw(' selected') : ''}>${p.name}</option>`)}</select></label>` : ''}
<label class="fld"><span>Credential</span><select name="cert_type_id" id="ctype" required><option value="">Select…</option>${types.map(t => html`<option value="${t.id}" data-cycle="${t.cycle_months}" data-hours="${t.hours_required}" data-ethics="${t.ethics_required}"${t.id === Number(v.cert_type_id) ? raw(' selected') : ''}>${t.name} (${t.code})</option>`)}</select><em>Selecting a credential pre-fills the standard cycle and hour requirements. Adjust for state-specific rules.</em></label>
<div class="row2"><label class="fld"><span>State / jurisdiction</span><input name="jurisdiction" value="${v.jurisdiction || ''}" maxlength="60" placeholder="e.g. California"></label>
<label class="fld"><span>Licence / certificate #</span><input name="licence_number" value="${v.licence_number || ''}" maxlength="60"></label></div>
<div class="row2"><label class="fld"><span>Current cycle start</span><input type="date" name="cycle_start" id="cstart" value="${v.cycle_start || ''}" required></label>
<label class="fld"><span>Renewal / expiry date</span><input type="date" name="expiry_date" id="cexp" value="${v.expiry_date || ''}" required></label></div>
<div class="row2"><label class="fld"><span>CE hours required this cycle</span><input type="number" step="0.5" min="0" max="500" name="hours_required" id="chours" value="${v.hours_required ?? ''}" required></label>
<label class="fld"><span>…of which ethics hours</span><input type="number" step="0.5" min="0" max="100" name="ethics_required" id="cethics" value="${v.ethics_required ?? 0}" required></label></div>
<label class="fld"><span>Notes</span><textarea name="notes" rows="3" maxlength="1000">${v.notes || ''}</textarea></label>
<div class="form-a"><a class="btn ghost" href="${c && c.id ? '/licences/' + c.id : '/licences'}">Cancel</a><button class="btn primary">${c && c.id ? 'Save changes' : 'Add licence'}</button></div></form>`;
    render(req, res, { title: c && c.id ? 'Edit licence' : 'Add licence', active: '/licences', body });
  }
  function parseLicence(req) {
    const b = req.body; const e = [];
    const out = {
      user_id: isAdmin(req) ? Number(b.user_id) : req.user.id, cert_type_id: Number(b.cert_type_id),
      jurisdiction: String(b.jurisdiction || '').trim().slice(0, 60) || null, licence_number: String(b.licence_number || '').trim().slice(0, 60) || null,
      cycle_start: String(b.cycle_start || ''), expiry_date: String(b.expiry_date || ''),
      hours_required: Number(b.hours_required), ethics_required: Number(b.ethics_required || 0), notes: String(b.notes || '').trim().slice(0, 1000) || null,
    };
    if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(out.user_id)) e.push('Choose a person.');
    if (!db.prepare('SELECT 1 FROM cert_types WHERE id=?').get(out.cert_type_id)) e.push('Choose a credential.');
    if (!isISODate(out.cycle_start) || !isISODate(out.expiry_date)) e.push('Enter valid dates.');
    else if (out.expiry_date <= out.cycle_start) e.push('Renewal date must be after the cycle start.');
    if (!(out.hours_required >= 0 && out.hours_required <= 500)) e.push('Hours required must be 0–500.');
    if (!(out.ethics_required >= 0 && out.ethics_required <= out.hours_required)) e.push('Ethics hours must be between 0 and the total required.');
    return { out, errors: e.join(' ') };
  }
  function getCert(req, id) { const c = loadCerts({ id: Number(id) })[0]; return c && canAccessUser(req, c.user_id) ? c : null; }

  app.get('/licences/new', (req, res) => licenceForm(req, res, null));
  app.post('/licences', (req, res) => {
    const { out, errors } = parseLicence(req);
    if (errors) return licenceForm(req, res, out, errors);
    const id = db.prepare('INSERT INTO user_certs(user_id,cert_type_id,jurisdiction,licence_number,cycle_start,expiry_date,hours_required,ethics_required,notes) VALUES(@user_id,@cert_type_id,@jurisdiction,@licence_number,@cycle_start,@expiry_date,@hours_required,@ethics_required,@notes)').run(out).lastInsertRowid;
    audit(req.user.id, 'licence.create', String(id), req.ip);
    flash(req, 'ok', 'Licence added.'); res.redirect('/licences/' + id);
  });
  app.get('/licences/:id', (req, res) => {
    const c = getCert(req, req.params.id); if (!c) return notFound(res);
    const admin = isAdmin(req);
    const entries = db.prepare('SELECT e.*, (SELECT COUNT(*) FROM files f WHERE f.ce_entry_id=e.id) files FROM ce_entries e WHERE e.user_id=? AND e.completed_date BETWEEN ? AND ? AND (e.user_cert_id IS NULL OR e.user_cert_id=?) ORDER BY completed_date DESC').all(c.user_id, c.cycle_start, c.expiry_date, c.id);
    const rems = db.prepare('SELECT r.*, o.subject, o.status ostatus FROM reminders r LEFT JOIN outbox o ON o.id=r.outbox_id WHERE r.user_cert_id=? ORDER BY r.id DESC').all(c.id);
    const milestones = THRESHOLDS.slice().reverse().map(t => { const d = addDays(c.expiry_date, -t); const sent = rems.find(r => r.kind === 'd' + t && r.cycle_expiry === c.expiry_date); return { t, d, sent, past: d <= todayISO() }; });
    const body = html`
<section class="grid g-2-1">
<div class="card"><div class="lic-head"><div class="lic-h"><span class="code">${c.code}</span>${badge(c.status)}</div>
<h2 class="xl">${c.type_name}</h2><p class="muted">${[c.jurisdiction, c.issuer, c.licence_number ? '#' + c.licence_number : null].filter(Boolean).join(' · ')}</p></div>
<div class="meters"><div class="meter"><span class="kpi-l">Total CE hours</span><div class="m-v"><strong>${n(c.hours)}</strong><span>/ ${n(c.hours_required)}</span></div>${progress(c.hours, c.hours_required, c.complete ? 'current' : c.status)}<span class="kpi-s">${c.hoursShort ? `${n(c.hoursShort)} hours to go` : 'Requirement met ✓'}</span></div>
<div class="meter"><span class="kpi-l">Ethics hours</span><div class="m-v"><strong>${n(c.ethics)}</strong><span>/ ${n(c.ethics_required)}</span></div>${progress(c.ethics, c.ethics_required || 1, c.ethicsShort ? c.status : 'current')}<span class="kpi-s">${c.ethics_required ? (c.ethicsShort ? `${n(c.ethicsShort)} ethics hours to go` : 'Requirement met ✓') : 'Not required'}</span></div>
<div class="meter"><span class="kpi-l">Renewal date</span><div class="m-v"><strong class="sm">${fmtDate(c.expiry_date)}</strong></div><span class="kpi-s ${c.days < 0 ? 't-bad' : c.days <= 90 ? 't-warn' : ''}">${relDays(c.days)} · cycle began ${fmtDate(c.cycle_start)}</span></div></div>
${c.notes ? html`<p class="note">${c.notes}</p>` : ''}
</div>
<div class="card"><div class="card-h"><div><h2>Reminder schedule</h2><p>Emails to ${admin ? c.person : 'you'}; admins copied at 30 days and when overdue</p></div></div>
<ol class="timeline">${milestones.map(m => html`<li class="${m.sent ? 'done' : m.past ? 'missed' : ''}"><span class="tl-dot"></span><div><strong>${m.t} days before</strong><span>${fmtDate(m.d)} · ${m.sent ? 'sent ' + fmtDateTime(m.sent.created_at) : m.past ? 'window passed' : 'scheduled'}</span></div></li>`)}
<li class="${c.days < 0 ? 'missed' : ''}"><span class="tl-dot"></span><div><strong>Weekly while overdue</strong><span>from ${fmtDate(addDays(c.expiry_date, 1))}${c.days < 0 ? ` · ${rems.filter(r => r.kind === 'overdue').length} sent` : ''}</span></div></li></ol>
${admin ? html`<form method="post" action="/licences/${c.id}/remind">${csrfField(res)}<button class="btn ghost wide">${icon('send')} Send reminder now</button></form>` : ''}
</div></section>
<div class="card flush"><div class="card-h pad"><div><h2>CE credits counted this cycle</h2><p>${entries.length} course${entries.length === 1 ? '' : 's'} between ${fmtDate(c.cycle_start)} and ${fmtDate(c.expiry_date)}</p></div><a class="btn ghost sm" href="/ce/new?user=${c.user_id}&amp;cert=${c.id}">${icon('plus')} Log CE</a></div>${ceTable(entries, false)}</div>
${rems.length ? html`<div class="card flush"><div class="card-h pad"><div><h2>Reminder log</h2></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sent</th><th>Trigger</th><th>Subject</th><th>Delivery</th></tr></thead><tbody>${rems.map(r => html`<tr><td class="nowrap">${fmtDateTime(r.created_at)}</td><td>${KIND_LABEL[r.kind] || r.kind}<span class="sub">${r.triggered_by}</span></td><td>${admin ? html`<a href="/outbox/${r.outbox_id}">${r.subject}</a>` : r.subject}</td><td><span class="pill">${r.ostatus}</span></td></tr>`)}</tbody></table></div></div>` : ''}`;
    render(req, res, { title: admin ? c.person : certLabel(c), subtitle: admin ? certLabel(c) : 'Licence detail', active: '/licences', body,
      actions: html`<a class="btn ghost" href="/licences/${c.id}/edit">${icon('edit')}<span class="hide-s">Edit</span></a>${admin ? html`<form method="post" action="/licences/${c.id}/delete" class="inline" data-confirm="Delete this licence and its reminder history?">${csrfField(res)}<button class="btn ghost danger" aria-label="Delete">${icon('trash')}</button></form>` : ''}` });
  });
  app.get('/licences/:id/edit', (req, res) => { const c = getCert(req, req.params.id); if (!c) return notFound(res); licenceForm(req, res, c); });
  app.post('/licences/:id', (req, res) => {
    const c = getCert(req, req.params.id); if (!c) return notFound(res);
    const { out, errors } = parseLicence(req);
    if (errors) return licenceForm(req, res, { ...out, id: c.id }, errors);
    db.prepare('UPDATE user_certs SET user_id=@user_id,cert_type_id=@cert_type_id,jurisdiction=@jurisdiction,licence_number=@licence_number,cycle_start=@cycle_start,expiry_date=@expiry_date,hours_required=@hours_required,ethics_required=@ethics_required,notes=@notes WHERE id=@id').run({ ...out, id: c.id });
    audit(req.user.id, 'licence.update', String(c.id), req.ip);
    flash(req, 'ok', 'Licence updated.'); res.redirect('/licences/' + c.id);
  });
  app.post('/licences/:id/delete', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM user_certs WHERE id=?').run(Number(req.params.id));
    audit(req.user.id, 'licence.delete', req.params.id, req.ip);
    flash(req, 'ok', 'Licence deleted.'); res.redirect('/licences');
  });
  app.post('/licences/:id/remind', requireAdmin, (req, res) => {
    const ok = sendManual(Number(req.params.id), 'manual:' + req.user.email);
    flash(req, ok ? 'ok' : 'error', ok ? `Reminder sent (${transportName() === 'smtp' ? 'via SMTP' : 'logged to outbox'}).` : 'Licence not found.');
    res.redirect('/licences/' + Number(req.params.id));
  });
};
