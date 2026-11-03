'use strict';
module.exports = (X) => {
  const { app, db, fs, path, crypto, multer, UPLOADS, loadCerts, todayISO, isISODate, audit, html, raw, icon, fmtDate, fmtDateTime, n, isAdmin, canAccessUser, flash, render, csrfField, notFound, verifyCsrf, certLabel, emptyState, ceTable } = X;

  const ALLOWED = { 'application/pdf': ['.pdf'], 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 30, fieldSize: 8192 } });
  function sniff(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    return null;
  }
  const backTo = req => { try { const r = new URL(req.get('referer') || '', 'http://x'); return r.pathname.startsWith('/') ? r.pathname : '/ce'; } catch { return '/ce'; } };
  function multipart(field) {
    return (req, res, next) => upload.single(field)(req, res, err => {
      if (err) {
        if (!csrfOk(req)) return verifyCsrf(req, res, next);
        flash(req, 'error', err.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 10 MB.' : 'Upload failed: ' + err.message);
        return res.redirect(backTo(req));
      }
      verifyCsrf(req, res, next);
    });
  }
  const csrfOk = req => { try { const a = Buffer.from(String((req.body && req.body._csrf) || '')), b = Buffer.from(req.session.csrf || ''); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); } catch { return false; } };
  function validateFile(file) {
    const type = sniff(file.buffer);
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!type || !ALLOWED[type].includes(ext)) throw new Error('Certificates must be a PDF, PNG, JPG or WEBP file (the file contents are checked, not just the name).');
    return type;
  }
  function storeFile(file, ownerId, entryId, uploaderId) {
    const type = validateFile(file);
    const uuid = crypto.randomUUID(); const stored = uuid + ALLOWED[type][0];
    fs.writeFileSync(path.join(UPLOADS, stored), file.buffer, { mode: 0o600 });
    const name = path.basename(file.originalname).replace(/[^\w.\- ()]/g, '_').slice(0, 120);
    db.prepare('INSERT INTO files(uuid,user_id,ce_entry_id,original_name,stored_name,mime,size,sha256,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uuid, ownerId, entryId, name, stored, type, file.size, crypto.createHash('sha256').update(file.buffer).digest('hex'), uploaderId);
    return uuid;
  }

  app.get('/ce', (req, res) => {
    const admin = isAdmin(req);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const args = []; const where = [];
    if (!admin) { where.push('e.user_id=?'); args.push(req.user.id); }
    if (q) { where.push("(e.title LIKE ? ESCAPE '\\' OR e.provider LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')"); const like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%'; args.push(like, like, like); }
    const entries = db.prepare(`SELECT e.*, u.name person, (SELECT COUNT(*) FROM files f WHERE f.ce_entry_id=e.id) files FROM ce_entries e JOIN users u ON u.id=e.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.completed_date DESC, e.id DESC LIMIT 500`).all(...args);
    const total = entries.reduce((a, e) => a + e.hours, 0); const missing = entries.filter(e => !e.files).length;
    const body = html`<div class="toolbar"><div class="stats"><span><strong>${entries.length}</strong> courses</span><span><strong>${n(total)}</strong> hours</span><span><strong>${missing}</strong> missing certificates</span></div>
<form class="filters" method="get"><label class="search">${icon('search')}<input name="q" value="${q}" placeholder="Search courses, providers${admin ? ', people' : ''}…"></label></form></div>
<div class="card flush">${ceTable(entries, admin)}</div>`;
    render(req, res, { title: admin ? 'CE credits' : 'My CE credits', subtitle: 'Completed continuing education and certificates', active: '/ce', body, actions: html`<a class="btn primary" href="/ce/new">${icon('upload')}<span class="hide-s">Log CE</span></a>` });
  });

  const FIELDS = ['Accounting', 'Auditing', 'Taxation', 'Ethics', 'Regulatory Ethics', 'Specialized Knowledge', 'Management Advisory', 'Information Technology', 'Finance', 'Business Law', 'Personal Development', 'Other'];
  const DELIVERY = ['Live (in person)', 'Group internet-based', 'Self-study (QAS)', 'Conference', 'Nano-learning', 'Instructor'];
  function ceForm(req, res, v, error) {
    const admin = isAdmin(req);
    const uid = Number(v.user_id) || req.user.id;
    const people = admin ? db.prepare('SELECT id,name FROM users WHERE active=1 ORDER BY name').all() : [];
    const certs = loadCerts(admin ? {} : { userId: req.user.id });
    const body = html`<form class="card form narrow" method="post" action="/ce" enctype="multipart/form-data">${csrfField(res)}
${error ? html`<div class="flash f-error">${icon('alert')}<span>${error}</span></div>` : ''}
${admin ? html`<label class="fld"><span>Person</span><select name="user_id" id="ceUser" required>${people.map(p => html`<option value="${p.id}"${p.id === uid ? raw(' selected') : ''}>${p.name}</option>`)}</select></label>` : ''}
<label class="fld"><span>Course title</span><input name="title" value="${v.title || ''}" required maxlength="200" placeholder="e.g. 2026 Federal Tax Update"></label>
<div class="row2"><label class="fld"><span>Provider / sponsor</span><input name="provider" value="${v.provider || ''}" maxlength="120" placeholder="e.g. AICPA, Becker, Surgent"></label>
<label class="fld"><span>Field of study</span><select name="field">${FIELDS.map(f => html`<option${f === v.field ? raw(' selected') : ''}>${f}</option>`)}</select></label></div>
<div class="row3"><label class="fld"><span>Completed on</span><input type="date" name="completed_date" value="${v.completed_date || todayISO()}" max="${todayISO()}" required></label>
<label class="fld"><span>CE hours</span><input type="number" name="hours" step="0.1" min="0.1" max="100" value="${v.hours || ''}" required></label>
<label class="fld"><span>Ethics hours (incl.)</span><input type="number" name="ethics_hours" step="0.1" min="0" max="100" value="${v.ethics_hours || 0}"></label></div>
<div class="row2"><label class="fld"><span>Delivery method</span><select name="delivery">${DELIVERY.map(f => html`<option${f === v.delivery ? raw(' selected') : ''}>${f}</option>`)}</select></label>
<label class="fld"><span>Counts toward</span><select name="user_cert_id" id="ceCert"><option value="">All licences in cycle</option>${certs.map(c => html`<option value="${c.id}" data-user="${c.user_id}"${c.id === Number(v.user_cert_id) ? raw(' selected') : ''}>${certLabel(c)}${admin ? ' — ' + c.person : ''}</option>`)}</select></label></div>
<label class="drop" id="drop"><input type="file" name="certificate" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp">${icon('upload', 'i big')}<strong data-default="Upload certificate of completion">Upload certificate of completion</strong><span>PDF, PNG, JPG or WEBP · up to 10 MB · drag &amp; drop or click</span></label>
<div class="form-a"><a class="btn ghost" href="/ce">Cancel</a><button class="btn primary">Save CE credit</button></div></form>`;
    render(req, res, { title: 'Log CE credit', subtitle: 'Record a completed course and attach its certificate', active: '/ce', body });
  }
  app.get('/ce/new', (req, res) => ceForm(req, res, { user_id: isAdmin(req) ? Number(req.query.user) || req.user.id : req.user.id, user_cert_id: Number(req.query.cert) || '' }));
  app.post('/ce', multipart('certificate'), (req, res) => {
    const b = req.body;
    const v = { user_id: isAdmin(req) ? Number(b.user_id) : req.user.id, title: String(b.title || '').trim().slice(0, 200), provider: String(b.provider || '').trim().slice(0, 120) || null,
      field: FIELDS.includes(b.field) ? b.field : 'Other', delivery: DELIVERY.includes(b.delivery) ? b.delivery : null, completed_date: String(b.completed_date || ''),
      hours: Number(b.hours), ethics_hours: Number(b.ethics_hours || 0), user_cert_id: b.user_cert_id ? Number(b.user_cert_id) : null };
    const err = [];
    if (!db.prepare('SELECT 1 FROM users WHERE id=?').get(v.user_id)) err.push('Choose a person.');
    if (!v.title) err.push('Enter a course title.');
    if (!isISODate(v.completed_date) || v.completed_date > todayISO()) err.push('Enter a valid completion date (not in the future).');
    if (!(v.hours > 0 && v.hours <= 100)) err.push('Hours must be between 0.1 and 100.');
    if (!(v.ethics_hours >= 0 && v.ethics_hours <= v.hours)) err.push('Ethics hours cannot exceed total hours.');
    if (v.user_cert_id && !db.prepare('SELECT 1 FROM user_certs WHERE id=? AND user_id=?').get(v.user_cert_id, v.user_id)) err.push('That licence does not belong to the selected person.');
    if (req.file) { try { validateFile(req.file); } catch (e) { err.push(e.message); } }
    if (err.length) return ceForm(req, res, v, err.join(' '));
    let id;
    db.transaction(() => {
      id = db.prepare('INSERT INTO ce_entries(user_id,user_cert_id,title,provider,field,delivery,completed_date,hours,ethics_hours,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(v.user_id, v.user_cert_id, v.title, v.provider, v.field, v.delivery, v.completed_date, v.hours, v.ethics_hours, req.user.id).lastInsertRowid;
      if (req.file) storeFile(req.file, v.user_id, id, req.user.id);
    })();
    audit(req.user.id, 'ce.create', String(id), req.ip);
    flash(req, 'ok', req.file ? 'CE credit saved with certificate.' : 'CE credit saved. Remember to upload the certificate.');
    res.redirect('/ce/' + id);
  });
  function getEntry(req, id) { const e = db.prepare('SELECT e.*, u.name person FROM ce_entries e JOIN users u ON u.id=e.user_id WHERE e.id=?').get(Number(id)); return e && canAccessUser(req, e.user_id) ? e : null; }
  app.get('/ce/:id', (req, res) => {
    const e = getEntry(req, req.params.id); if (!e) return notFound(res);
    const files = db.prepare('SELECT * FROM files WHERE ce_entry_id=? ORDER BY id').all(e.id);
    const lic = e.user_cert_id ? loadCerts({ id: e.user_cert_id })[0] : null;
    const f = files[0];
    const body = html`<section class="grid g-1-2">
<div class="card"><dl class="dl">
<div><dt>Person</dt><dd>${e.person}</dd></div><div><dt>Provider</dt><dd>${e.provider || '—'}</dd></div>
<div><dt>Field of study</dt><dd>${e.field || '—'}</dd></div><div><dt>Delivery</dt><dd>${e.delivery || '—'}</dd></div>
<div><dt>Completed</dt><dd>${fmtDate(e.completed_date)}</dd></div><div><dt>Hours</dt><dd><strong>${n(e.hours)}</strong>${e.ethics_hours ? html` <span class="muted">(${n(e.ethics_hours)} ethics)</span>` : ''}</dd></div>
<div class="span"><dt>Counts toward</dt><dd>${lic ? html`<a href="/licences/${lic.id}">${certLabel(lic)}</a>` : 'All licences whose cycle includes the completion date'}</dd></div>
</dl>
<h3 class="sec-t sm">Certificates</h3>
${files.length ? html`<ul class="files">${files.map(x => html`<li>${icon('file')}<div><a href="/files/${x.uuid}" target="_blank" rel="noopener">${x.original_name}</a><span>${(x.size / 1024).toFixed(0)} KB · ${fmtDateTime(x.uploaded_at)} · sha256 ${x.sha256.slice(0, 10)}…</span></div><a class="icon-btn" href="/files/${x.uuid}?download=1" aria-label="Download">${icon('download')}</a></li>`)}</ul>` : html`<p class="muted">No certificate uploaded yet.</p>`}
<form method="post" action="/ce/${e.id}/files" enctype="multipart/form-data" class="up-inline">${csrfField(res)}<label class="drop sm" id="drop"><input type="file" name="certificate" required accept=".pdf,.png,.jpg,.jpeg,.webp">${icon('upload')}<strong data-default="${files.length ? 'Add another file' : 'Upload certificate'}">${files.length ? 'Add another file' : 'Upload certificate'}</strong></label><button class="btn ghost">Upload</button></form>
</div>
<div class="card viewer">${f ? (f.mime === 'application/pdf' ? html`<iframe src="/files/${f.uuid}" title="Certificate preview"></iframe>` : html`<img src="/files/${f.uuid}" alt="Certificate">`) : emptyState('No certificate on file', 'Upload a PDF or image of the certificate of completion — it’s needed for audits.')}</div>
</section>`;
    render(req, res, { title: e.title, subtitle: `${e.person} · ${n(e.hours)} CE hours · ${fmtDate(e.completed_date)}`, active: '/ce', body,
      actions: html`<form method="post" action="/ce/${e.id}/delete" class="inline" data-confirm="Delete this CE credit and its certificates?">${csrfField(res)}<button class="btn ghost danger">${icon('trash')}<span class="hide-s">Delete</span></button></form>` });
  });
  app.post('/ce/:id/files', multipart('certificate'), (req, res) => {
    const e = getEntry(req, req.params.id); if (!e) return notFound(res);
    if (!req.file) { flash(req, 'error', 'Choose a file to upload.'); return res.redirect('/ce/' + e.id); }
    try { storeFile(req.file, e.user_id, e.id, req.user.id); flash(req, 'ok', 'Certificate uploaded.'); audit(req.user.id, 'file.upload', String(e.id), req.ip); }
    catch (err) { flash(req, 'error', err.message); }
    res.redirect('/ce/' + e.id);
  });
  app.post('/ce/:id/delete', (req, res) => {
    const e = getEntry(req, req.params.id); if (!e) return notFound(res);
    const files = db.prepare('SELECT stored_name FROM files WHERE ce_entry_id=?').all(e.id);
    db.prepare('DELETE FROM ce_entries WHERE id=?').run(e.id);
    files.forEach(f => fs.rm(path.join(UPLOADS, path.basename(f.stored_name)), { force: true }, () => {}));
    audit(req.user.id, 'ce.delete', String(e.id), req.ip);
    flash(req, 'ok', 'CE credit deleted.'); res.redirect('/ce');
  });
  app.get('/files/:uuid', (req, res) => {
    const f = db.prepare('SELECT * FROM files WHERE uuid=?').get(String(req.params.uuid));
    if (!f || !canAccessUser(req, f.user_id)) return notFound(res);
    const p = path.join(UPLOADS, path.basename(f.stored_name));
    if (!fs.existsSync(p)) return notFound(res);
    res.set({ 'Content-Type': f.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
      'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="${f.original_name.replace(/["\\\r\n]/g, '_')}"` });
    if (f.mime !== 'application/pdf') res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    audit(req.user.id, 'file.view', f.uuid, req.ip);
    res.sendFile(p);
  });
};
