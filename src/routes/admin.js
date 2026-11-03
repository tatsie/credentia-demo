'use strict';
module.exports = (X) => {
  const { app, db, bcrypt, loadCerts, todayISO, STATUS_LABEL, runReminders, KIND_LABEL, THRESHOLDS, transportName, audit, html, raw, icon, badge, avatar, fmtDateTime, n, requireAdmin, flash, render, csrfField, notFound, emptyState, ceTable, licCard } = X;

  // ---------- people ----------
  app.get('/people', requireAdmin, (req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY active DESC, name').all();
    const certs = loadCerts();
    const body = html`<div class="card flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Office</th><th class="num">Licences</th><th class="num">Hours to go</th><th>Standing</th><th>Last sign-in</th></tr></thead><tbody>
${users.map(u => { const cs = certs.filter(c => c.user_id === u.id); const worst = cs.some(c => c.status === 'expired') ? 'expired' : cs.some(c => c.status === 'due') ? 'due' : 'current'; const short = cs.filter(c => c.status !== 'expired').reduce((a, c) => a + c.hoursShort, 0);
    return html`<tr class="rowlink${u.active ? '' : ' dim'}" data-href="/people/${u.id}"><td><div class="who">${avatar(u.name, 'sm')}<span><a href="/people/${u.id}"><strong>${u.name}</strong></a><span class="sub">${u.title || ''}${u.title ? ' · ' : ''}${u.email}</span></span></div></td><td><span class="pill${u.role === 'admin' ? ' acc' : ''}">${u.role}</span></td><td>${u.office || '—'}</td><td class="num">${cs.length}</td><td class="num">${short ? n(short) : '—'}</td><td>${u.active ? (cs.length ? badge(worst) : html`<span class="muted">No licences</span>`) : html`<span class="pill">Deactivated</span>`}</td><td class="nowrap muted">${u.last_login ? fmtDateTime(u.last_login) : 'Never'}</td></tr>`; })}
</tbody></table></div></div>`;
    render(req, res, { title: 'People', subtitle: `${users.filter(u => u.active).length} active accounts`, active: '/people', body, actions: html`<a class="btn primary" href="/people/new">${icon('plus')}<span class="hide-s">Add person</span></a>` });
  });
  function personForm(req, res, u, error) {
    const isNew = !u || !u.id; const v = u || { role: 'staff', active: 1 };
    return html`<form class="card form" method="post" action="${isNew ? '/people' : '/people/' + v.id}">${csrfField(res)}
${error ? html`<div class="flash f-error">${icon('alert')}<span>${error}</span></div>` : ''}
<div class="row2"><label class="fld"><span>Full name</span><input name="name" value="${v.name || ''}" required maxlength="100"></label>
<label class="fld"><span>Work email</span><input type="email" name="email" value="${v.email || ''}" required maxlength="200"></label></div>
<div class="row2"><label class="fld"><span>Title</span><input name="title" value="${v.title || ''}" maxlength="100" placeholder="e.g. Senior Tax Manager"></label>
<label class="fld"><span>Office</span><input name="office" value="${v.office || ''}" maxlength="60" placeholder="e.g. San Francisco"></label></div>
<div class="row2"><label class="fld"><span>Role</span><select name="role"><option value="staff"${v.role === 'staff' ? raw(' selected') : ''}>Staff — sees only their own records</option><option value="admin"${v.role === 'admin' ? raw(' selected') : ''}>Admin — firm-wide access</option></select></label>
<label class="fld"><span>${isNew ? 'Initial password' : 'Set new password'}</span><input type="password" name="password" minlength="12" maxlength="200" autocomplete="new-password" ${isNew ? raw('required') : ''} placeholder="${isNew ? 'At least 12 characters' : 'Leave blank to keep current'}"></label></div>
${!isNew ? html`<label class="chk"><input type="checkbox" name="active" value="1"${v.active ? raw(' checked') : ''}> Account active (deactivated users can’t sign in and get no reminders)</label>` : ''}
<div class="form-a"><button class="btn primary">${isNew ? 'Create account' : 'Save'}</button></div></form>`;
  }
  function parsePerson(req, isNew) {
    const b = req.body;
    const v = { name: String(b.name || '').trim().slice(0, 100), email: String(b.email || '').trim().toLowerCase().slice(0, 200), title: String(b.title || '').trim().slice(0, 100) || null, office: String(b.office || '').trim().slice(0, 60) || null, role: b.role === 'admin' ? 'admin' : 'staff', active: b.active ? 1 : 0, password: String(b.password || '') };
    const e = [];
    if (!v.name) e.push('Name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.push('Enter a valid email.');
    if ((isNew || v.password) && v.password.length < 12) e.push('Password must be at least 12 characters.');
    return { v, error: e.join(' ') };
  }
  const newPage = (req, res, v, err) => render(req, res, { title: 'Add person', active: '/people', body: html`<div class="narrow">${personForm(req, res, v, err)}</div>` });
  app.get('/people/new', requireAdmin, (req, res) => newPage(req, res, null));
  app.post('/people', requireAdmin, (req, res) => {
    const { v, error } = parsePerson(req, true);
    if (error) return newPage(req, res, v, error);
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(v.email)) return newPage(req, res, v, 'That email is already in use.');
    const id = db.prepare('INSERT INTO users(email,name,password_hash,role,title,office) VALUES(?,?,?,?,?,?)').run(v.email, v.name, bcrypt.hashSync(v.password, 12), v.role, v.title, v.office).lastInsertRowid;
    audit(req.user.id, 'user.create', v.email, req.ip); flash(req, 'ok', 'Account created.'); res.redirect('/people/' + id);
  });
  app.get('/people/:id', requireAdmin, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id)); if (!u) return notFound(res);
    const certs = loadCerts({ userId: u.id });
    const entries = db.prepare('SELECT e.*, (SELECT COUNT(*) FROM files f WHERE f.ce_entry_id=e.id) files FROM ce_entries e WHERE user_id=? ORDER BY completed_date DESC').all(u.id);
    const body = html`<section class="lic-grid">${certs.map(c => licCard(c))}<a class="card lic add" href="/licences/new">${icon('plus', 'i big')}<strong>Add licence</strong></a></section>
<div class="card flush"><div class="card-h pad"><div><h2>CE credits</h2><p>${entries.length} courses · ${n(entries.reduce((a, e) => a + e.hours, 0))} hours</p></div><a class="btn ghost sm" href="/ce/new?user=${u.id}">${icon('plus')} Log CE</a></div>${ceTable(entries, false)}</div>
<h3 class="sec-t">Account</h3><div class="narrow-l">${personForm(req, res, u)}</div>`;
    render(req, res, { title: u.name, subtitle: [u.title, u.office, u.email].filter(Boolean).join(' · '), active: '/people', body });
  });
  app.post('/people/:id', requireAdmin, (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(Number(req.params.id)); if (!u) return notFound(res);
    const { v, error } = parsePerson(req, false);
    if (error) { flash(req, 'error', error); return res.redirect('/people/' + u.id); }
    if (u.id === req.user.id && (v.role !== 'admin' || !v.active)) { flash(req, 'error', 'You can’t remove your own admin access or deactivate yourself.'); return res.redirect('/people/' + u.id); }
    if (db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(v.email, u.id)) { flash(req, 'error', 'That email is already in use.'); return res.redirect('/people/' + u.id); }
    db.prepare('UPDATE users SET name=?,email=?,title=?,office=?,role=?,active=? WHERE id=?').run(v.name, v.email, v.title, v.office, v.role, v.active, u.id);
    if (v.password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(v.password, 12), u.id);
    if (v.password || !v.active || v.role !== u.role) db.prepare("DELETE FROM sessions WHERE json_extract(sess,'$.uid')=?").run(u.id);
    audit(req.user.id, 'user.update', String(u.id), req.ip); flash(req, 'ok', 'Account saved.');
    res.redirect('/people/' + u.id);
  });

  // ---------- catalog ----------
  app.get('/catalog', requireAdmin, (req, res) => {
    const types = db.prepare('SELECT ct.*, (SELECT COUNT(*) FROM user_certs uc WHERE uc.cert_type_id=ct.id) holders FROM cert_types ct ORDER BY name').all();
    const edit = types.find(t => t.id === Number(req.query.edit));
    const v = edit || {};
    const body = html`<section class="grid g-2-1"><div class="card flush"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Credential</th><th>Issuer</th><th class="num">Cycle</th><th class="num">Hours</th><th class="num">Ethics</th><th class="num">Holders</th><th></th></tr></thead><tbody>
${types.map(t => html`<tr><td><span class="code">${t.code}</span> <strong>${t.name}</strong>${t.notes ? html`<span class="sub">${t.notes}</span>` : ''}</td><td class="muted">${t.issuer || '—'}</td><td class="num">${t.cycle_months} mo</td><td class="num">${n(t.hours_required)}</td><td class="num">${n(t.ethics_required)}</td><td class="num">${t.holders}</td><td><a class="icon-btn" href="/catalog?edit=${t.id}" aria-label="Edit">${icon('edit')}</a></td></tr>`)}
</tbody></table></div></div>
<form class="card form" method="post" action="${edit ? '/catalog/' + edit.id : '/catalog'}">${csrfField(res)}<h2>${edit ? 'Edit credential' : 'Add credential'}</h2><p class="muted">Defaults used when adding a licence. State-specific rules can be set per licence.</p>
<div class="row2"><label class="fld"><span>Code</span><input name="code" value="${v.code || ''}" required maxlength="12" placeholder="CPA-CA"></label><label class="fld"><span>Cycle (months)</span><input type="number" name="cycle_months" min="1" max="120" value="${v.cycle_months || 24}" required></label></div>
<label class="fld"><span>Name</span><input name="name" value="${v.name || ''}" required maxlength="100"></label>
<label class="fld"><span>Issuing body</span><input name="issuer" value="${v.issuer || ''}" maxlength="100"></label>
<div class="row2"><label class="fld"><span>Hours per cycle</span><input type="number" step="0.5" name="hours_required" min="0" max="500" value="${v.hours_required ?? ''}" required></label><label class="fld"><span>Ethics hours</span><input type="number" step="0.5" name="ethics_required" min="0" max="100" value="${v.ethics_required ?? 0}" required></label></div>
<label class="fld"><span>Notes</span><input name="notes" value="${v.notes || ''}" maxlength="300"></label>
<div class="form-a">${edit ? html`<a class="btn ghost" href="/catalog">Cancel</a>` : ''}<button class="btn primary">${edit ? 'Save' : 'Add credential'}</button></div></form></section>`;
    render(req, res, { title: 'Credential catalog', subtitle: 'Licence and certification types tracked by the firm', active: '/catalog', body });
  });
  function saveType(req, res, id) {
    const b = req.body; const v = { code: String(b.code || '').trim().toUpperCase().slice(0, 12), name: String(b.name || '').trim().slice(0, 100), issuer: String(b.issuer || '').trim().slice(0, 100) || null, cycle_months: Math.round(Number(b.cycle_months)), hours_required: Number(b.hours_required), ethics_required: Number(b.ethics_required || 0), notes: String(b.notes || '').trim().slice(0, 300) || null };
    if (!/^[A-Z0-9-]{1,12}$/.test(v.code) || !v.name || !(v.cycle_months >= 1 && v.cycle_months <= 120) || !(v.hours_required >= 0 && v.hours_required <= 500) || !(v.ethics_required >= 0 && v.ethics_required <= v.hours_required)) { flash(req, 'error', 'Check the fields: code (letters, digits, dashes), cycle 1–120 months, ethics ≤ total hours.'); return res.redirect('/catalog' + (id ? '?edit=' + id : '')); }
    if (db.prepare('SELECT 1 FROM cert_types WHERE code=? AND id<>?').get(v.code, id || 0)) { flash(req, 'error', 'That code is already used.'); return res.redirect('/catalog'); }
    if (id) db.prepare('UPDATE cert_types SET code=@code,name=@name,issuer=@issuer,cycle_months=@cycle_months,hours_required=@hours_required,ethics_required=@ethics_required,notes=@notes WHERE id=@id').run({ ...v, id });
    else db.prepare('INSERT INTO cert_types(code,name,issuer,cycle_months,hours_required,ethics_required,notes) VALUES(@code,@name,@issuer,@cycle_months,@hours_required,@ethics_required,@notes)').run(v);
    flash(req, 'ok', 'Credential saved.'); res.redirect('/catalog');
  }
  app.post('/catalog', requireAdmin, (req, res) => saveType(req, res, null));
  app.post('/catalog/:id', requireAdmin, (req, res) => saveType(req, res, Number(req.params.id)));

  // ---------- reminders & outbox ----------
  app.get('/reminders', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT r.*, u.name person, ct.name type_name, uc.jurisdiction, o.status ostatus FROM reminders r JOIN users u ON u.id=r.user_id JOIN user_certs uc ON uc.id=r.user_cert_id JOIN cert_types ct ON ct.id=uc.cert_type_id LEFT JOIN outbox o ON o.id=r.outbox_id ORDER BY r.id DESC LIMIT 300').all();
    const body = html`<section class="grid g-2-1">
<div class="card flush"><div class="card-h pad"><div><h2>Reminder log</h2><p>${rows.length} most recent</p></div></div>
${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sent</th><th>Person</th><th>Credential</th><th>Trigger</th><th>Delivery</th></tr></thead><tbody>${rows.map(r => html`<tr class="rowlink" data-href="/outbox/${r.outbox_id}"><td class="nowrap">${fmtDateTime(r.created_at)}</td><td><div class="who">${avatar(r.person, 'sm')}<span>${r.person}</span></div></td><td><a href="/licences/${r.user_cert_id}">${r.type_name}${r.jurisdiction ? ' · ' + r.jurisdiction : ''}</a><span class="sub">${r.days_left < 0 ? Math.abs(r.days_left) + ' days overdue' : r.days_left + ' days left'}</span></td><td><span class="pill${r.kind === 'overdue' ? ' bad' : r.kind === 'd30' ? ' warn' : ''}">${KIND_LABEL[r.kind] || r.kind}</span><span class="sub">${r.triggered_by}</span></td><td><span class="pill">${r.ostatus}</span></td></tr>`)}</tbody></table></div>` : emptyState('No reminders yet', 'Run the scheduler to send due reminders.')}</div>
<div class="card"><div class="card-h"><div><h2>How reminders work</h2></div></div>
<ol class="timeline">${THRESHOLDS.slice().reverse().map(t => html`<li class="done"><span class="tl-dot"></span><div><strong>${t} days before renewal</strong><span>Email to the licence holder${t === 30 ? ', admins copied' : ''}</span></div></li>`)}<li class="missed"><span class="tl-dot"></span><div><strong>Weekly once overdue</strong><span>Holder emailed, admins copied, until renewed</span></div></li></ol>
<p class="muted small">The scheduler runs hourly and on start-up. Each threshold is sent once per renewal cycle — updating the renewal date starts a new cycle. Delivery: <strong>${transportName() === 'smtp' ? 'SMTP' : 'Outbox only (no SMTP configured)'}</strong>.</p>
<form method="post" action="/reminders/run">${csrfField(res)}<button class="btn primary wide">${icon('send')} Run reminder check now</button></form></div></section>`;
    render(req, res, { title: 'Reminders', subtitle: 'Automated renewal notices', active: '/reminders', body });
  });
  app.post('/reminders/run', requireAdmin, (req, res) => { const c = runReminders('manual-run:' + req.user.email); flash(req, 'ok', c ? `${c} reminder${c === 1 ? '' : 's'} sent.` : 'No reminders were due — everyone has already been notified for their current window.'); res.redirect('/reminders'); });
  app.get('/outbox', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM outbox ORDER BY id DESC LIMIT 300').all();
    const body = html`${transportName() === 'outbox' ? html`<div class="flash f-info">${icon('mail')}<span>No SMTP server is configured, so emails are recorded here (and in the server log) instead of being delivered. Set <code>SMTP_HOST</code>, <code>SMTP_USER</code> and <code>SMTP_PASS</code> to send for real.</span></div>` : ''}
<div class="card flush">${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Created</th><th>To</th><th>Subject</th><th>Transport</th><th>Status</th></tr></thead><tbody>${rows.map(o => html`<tr class="rowlink" data-href="/outbox/${o.id}"><td class="nowrap">${fmtDateTime(o.created_at)}</td><td>${o.to_email}${o.cc ? html`<span class="sub">cc ${o.cc}</span>` : ''}</td><td><a href="/outbox/${o.id}">${o.subject}</a></td><td>${o.transport}</td><td><span class="pill${o.status === 'failed' ? ' bad' : ''}">${o.status}</span></td></tr>`)}</tbody></table></div>` : emptyState('Outbox is empty', 'Emails will appear here.')}</div>`;
    render(req, res, { title: 'Outbox', subtitle: 'Every email the system has sent or queued', active: '/outbox', body });
  });
  app.get('/outbox/:id', requireAdmin, (req, res) => {
    const o = db.prepare('SELECT * FROM outbox WHERE id=?').get(Number(req.params.id)); if (!o) return notFound(res);
    const body = html`<div class="card mail narrow"><dl class="mail-h"><div><dt>To</dt><dd>${o.to_email}</dd></div>${o.cc ? html`<div><dt>Cc</dt><dd>${o.cc}</dd></div>` : ''}<div><dt>Subject</dt><dd><strong>${o.subject}</strong></dd></div><div><dt>Created</dt><dd>${fmtDateTime(o.created_at)} · ${o.transport} · ${o.status}${o.error ? ' — ' + o.error : ''}</dd></div></dl><pre class="mail-b">${o.body_text}</pre></div>`;
    render(req, res, { title: 'Email', active: '/outbox', body, actions: html`<a class="btn ghost" href="/outbox">Back to outbox</a>` });
  });

  // ---------- account (all users) ----------
  app.get('/account', (req, res) => {
    const log = db.prepare("SELECT * FROM audit WHERE user_id=? AND action LIKE 'login%' ORDER BY id DESC LIMIT 8").all(req.user.id);
    const body = html`<section class="grid g-1-1"><form class="card form" method="post" action="/account/password">${csrfField(res)}<h2>Change password</h2><p class="muted">Use at least 12 characters. Changing it signs out your other sessions.</p>
<label class="fld"><span>Current password</span><input type="password" name="current" required autocomplete="current-password" maxlength="200"></label>
<label class="fld"><span>New password</span><input type="password" name="next" required minlength="12" autocomplete="new-password" maxlength="200"></label>
<label class="fld"><span>Confirm new password</span><input type="password" name="confirm" required minlength="12" autocomplete="new-password" maxlength="200"></label>
<div class="form-a"><button class="btn primary">Update password</button></div></form>
<div class="card"><div class="card-h"><div><h2>Recent sign-in activity</h2><p>${req.user.email}</p></div></div>${log.length ? html`<ul class="feed">${log.map(l => html`<li><div class="feed-row"><span class="feed-ic${l.action === 'login.failed' ? ' bad' : ''}">${icon(l.action === 'login.failed' ? 'alert' : 'lock')}</span><div><strong>${l.action === 'login.failed' ? 'Failed sign-in' : 'Signed in'}</strong><span>${fmtDateTime(l.created_at)}${l.ip ? ' · ' + l.ip : ''}</span></div></div></li>`)}</ul>` : emptyState('No activity', '')}</div></section>`;
    render(req, res, { title: 'Account', subtitle: `${req.user.name} · ${req.user.role === 'admin' ? 'Administrator' : 'Staff'}`, active: '/account', body });
  });
  app.post('/account/password', async (req, res) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    const current = String(req.body.current || ''), next = String(req.body.next || ''), confirm = String(req.body.confirm || '');
    if (!(await bcrypt.compare(current, u.password_hash))) { flash(req, 'error', 'Your current password is incorrect.'); return res.redirect('/account'); }
    if (next.length < 12 || next !== confirm) { flash(req, 'error', 'New passwords must match and be at least 12 characters.'); return res.redirect('/account'); }
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(next, 12), u.id);
    db.prepare("DELETE FROM sessions WHERE json_extract(sess,'$.uid')=? AND sid<>?").run(u.id, req.sessionID);
    audit(u.id, 'password.change', null, req.ip); flash(req, 'ok', 'Password updated.'); res.redirect('/account');
  });

  // ---------- reports ----------
  app.get('/reports/compliance.csv', requireAdmin, (req, res) => {
    const cell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [['Person', 'Email', 'Office', 'Credential', 'Jurisdiction', 'Licence #', 'Cycle start', 'Renewal date', 'Days left', 'Hours earned', 'Hours required', 'Ethics earned', 'Ethics required', 'Status']];
    loadCerts().filter(c => c.active).forEach(c => rows.push([c.person, c.email, c.office, c.type_name, c.jurisdiction, c.licence_number, c.cycle_start, c.expiry_date, c.days, c.hours, c.hours_required, c.ethics, c.ethics_required, STATUS_LABEL[c.status]]));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="ce-compliance-${todayISO()}.csv"`, 'Cache-Control': 'private, no-store' });
    res.send(rows.map(r => r.map(cell).join(',')).join('\r\n'));
  });
};
