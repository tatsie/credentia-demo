'use strict';
// Usage: node src/seed.js [--reset]   Seeds demo data and writes DEMO_CREDENTIALS.md (chmod 600).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const STORAGE = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
if (process.argv.includes('--reset')) { fs.rmSync(STORAGE, { recursive: true, force: true }); }
const { db, UPLOADS } = require('./db');
const bcrypt = require('bcryptjs');
const { todayISO, addDays, addMonths, loadCerts, daysBetween } = require('./domain');
const { deliver, runReminders, THRESHOLDS } = require('./reminders');

if (db.prepare('SELECT COUNT(*) c FROM users').get().c) { console.log('Database already seeded. Use --reset to start over.'); process.exit(0); }
const T = todayISO();
const D = '@harborpine.example';

const types = [
  ['CPA-CA', 'CPA — California', 'California Board of Accountancy', 24, 80, 4, 'Biennial; incl. 4h regulatory review every 6 yrs (sample rule)'],
  ['CPA-NY', 'CPA — New York', 'NYSED Office of the Professions', 36, 120, 4, 'Triennial registration; 40h/yr (sample rule)'],
  ['CPA-TX', 'CPA — Texas', 'Texas State Board of Public Accountancy', 36, 120, 4, '40h/yr, 120h over 3 yrs (sample rule)'],
  ['CPA-FL', 'CPA — Florida', 'Florida Board of Accountancy', 24, 80, 4, 'Biennial; 8h A&A, 4h ethics (sample rule)'],
  ['CPA-IL', 'CPA — Illinois', 'IDFPR', 36, 120, 4, 'Triennial; incl. sexual harassment prevention (sample rule)'],
  ['CPA-WA', 'CPA — Washington', 'Washington State Board of Accountancy', 36, 120, 4, 'Triennial; board-approved ethics (sample rule)'],
  ['EA', 'Enrolled Agent', 'IRS Return Preparer Office', 36, 72, 6, '16h minimum per year incl. 2h ethics'],
  ['CFP', 'Certified Financial Planner', 'CFP Board', 24, 30, 2, 'Biennial reporting period'],
  ['CMA', 'Certified Management Accountant', 'Institute of Management Accountants', 12, 30, 2, 'Annual'],
  ['CISA', 'Certified Information Systems Auditor', 'ISACA', 36, 120, 0, '20h minimum each year'],
  ['ABV', 'Accredited in Business Valuation', 'AICPA', 36, 60, 0, 'Valuation-related CPE'],
  ['CFF', 'Certified in Financial Forensics', 'AICPA', 36, 60, 0, 'Forensic-related CPE'],
];
const typeId = {};
for (const t of types) typeId[t[0]] = db.prepare('INSERT INTO cert_types(code,name,issuer,cycle_months,hours_required,ethics_required,notes) VALUES(?,?,?,?,?,?,?)').run(...t).lastInsertRowid;
const typeBy = Object.fromEntries(types.map(t => [t[0], t]));

// Production bootstrap: catalog + a single admin from env, no demo people.
if (process.argv.includes('--admin-only') || process.env.SEED_MODE === 'admin-only') {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase(), pass = process.env.ADMIN_PASSWORD || '';
  if (!email || pass.length < 12) { console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars).'); process.exit(1); }
  db.prepare('INSERT INTO users(email,name,password_hash,role,title) VALUES(?,?,?,?,?)').run(email, process.env.ADMIN_NAME || 'Administrator', bcrypt.hashSync(pass, 12), 'admin', 'Administrator');
  console.log('Created admin ' + email + ' and the credential catalog.'); process.exit(0);
}

// [name, title, office, role, demoLogin?, [[code, jurisdiction, daysToExpiry, fractionDone, ethicsDone?], ...]]
const people = [
  ['Morgan Ellis', 'Director of Operations', 'San Francisco', 'admin', true, []],
  ['Priya Raman', 'Managing Partner', 'San Francisco', 'admin', false, [['CPA-CA', 'California', 600, 0.5, true], ['CFF', null, 400, 0.6]]],
  ['Daniel Okafor', 'Senior Tax Manager', 'San Francisco', 'staff', true, [['CPA-CA', 'California', 25, 0.88, false], ['CPA-NY', 'New York', 410, 0.55, true], ['EA', null, 200, 0.8, true]]],
  ['Sarah Lindqvist', 'Audit Manager', 'Dallas', 'staff', true, [['CPA-TX', 'Texas', 85, 1, true], ['CISA', null, 300, 0.6]]],
  ['James Whitaker', 'Wealth Advisor', 'Miami', 'staff', true, [['CFP', null, -12, 0.7, false], ['CPA-FL', 'Florida', 115, 0.75, true]]],
  ['Elena Marquez', 'Outsourced Controller', 'Chicago', 'staff', false, [['CMA', null, 58, 1, true], ['CPA-IL', 'Illinois', 500, 0.4, false]]],
  ['Kevin Cho', 'Tax Associate', 'San Francisco', 'staff', false, [['EA', null, -40, 0.5, false]]],
  ['Aisha Bello', 'IT Audit Senior', 'Seattle', 'staff', false, [['CISA', null, 150, 0.85], ['CPA-WA', 'Washington', 700, 0.3, false]]],
  ['Tom Brennan', 'Valuation Partner', 'San Francisco', 'staff', false, [['CPA-CA', 'California', 330, 1, true], ['ABV', null, 240, 0.7]]],
  ['Rachel Kim', 'Audit Senior', 'New York', 'staff', false, [['CPA-NY', 'New York', 95, 0.9, true]]],
  ['Marcus Webb', 'Tax Manager', 'Dallas', 'staff', false, [['CPA-TX', 'Texas', 260, 0.9, true]]],
  ['Hannah Fischer', 'Assurance Manager', 'Miami', 'staff', false, [['CPA-FL', 'Florida', 180, 1, true]]],
  ['Liam O’Connor', 'FP&A Consultant', 'Chicago', 'staff', false, [['CMA', null, 20, 0.6, false]]],
  ['Grace Nakamura', 'Tax Senior', 'San Francisco', 'staff', false, [['CPA-CA', 'California', 450, 0.7, true]]],
  ['Omar Haddad', 'Tax Senior', 'New York', 'staff', false, [['EA', null, 365, 0.8, true], ['CPA-NY', 'New York', 620, 0.35, false]]],
];

const courses = {
  tax: [['Federal Tax Update', 'AICPA', 'Taxation', 8], ['Partnership Taxation Deep Dive', 'Surgent', 'Taxation', 4], ['S Corporation Basis & Distributions', 'Becker', 'Taxation', 3], ['State & Local Tax Nexus After Wayfair', 'CalCPA', 'Taxation', 2], ['IRS Practice & Procedure', 'NATP', 'Taxation', 4], ['Estate & Gift Tax Planning', 'AICPA', 'Taxation', 6]],
  audit: [['Yellow Book Update', 'AICPA', 'Auditing', 4], ['Risk Assessment Standards (SAS 145)', 'Becker', 'Auditing', 3], ['Revenue Recognition (ASC 606) in Practice', 'Surgent', 'Accounting', 4], ['Lease Accounting (ASC 842) Refresher', 'AICPA', 'Accounting', 2], ['Audit Data Analytics', 'ISACA', 'Information Technology', 6]],
  it: [['SOC 2 Reporting Essentials', 'AICPA', 'Information Technology', 4], ['Cloud Controls & Shared Responsibility', 'ISACA', 'Information Technology', 8], ['Cybersecurity Risk Management', 'ISACA', 'Information Technology', 6], ['IT General Controls Testing', 'Becker', 'Auditing', 4]],
  plan: [['Retirement Income Planning', 'CFP Board', 'Finance', 3], ['Behavioral Finance for Advisors', 'Kitces', 'Finance', 2], ['Insurance Planning Update', 'The American College', 'Finance', 2], ['Investment Policy Statements', 'CFA Institute', 'Finance', 2]],
  mgmt: [['Strategic Cost Management', 'IMA', 'Management Advisory', 4], ['Data Visualization for Finance', 'IMA', 'Information Technology', 3], ['Forecasting & Scenario Planning', 'IMA', 'Finance', 4], ['Leadership for Finance Managers', 'AICPA', 'Personal Development', 2]],
  val: [['Business Valuation Fundamentals', 'AICPA', 'Specialized Knowledge', 8], ['Discount for Lack of Marketability', 'NACVA', 'Specialized Knowledge', 4], ['Forensic Accounting & Fraud Schemes', 'ACFE', 'Specialized Knowledge', 6], ['Litigation Support Engagements', 'AICPA', 'Specialized Knowledge', 4]],
};
const pool = code => code.startsWith('CPA') ? [...courses.tax, ...courses.audit] : code === 'EA' ? courses.tax : code === 'CISA' ? courses.it : code === 'CFP' ? courses.plan : code === 'CMA' ? courses.mgmt : courses.val;
const ethicsCourse = code => code === 'CFP' ? ['CFP Board Code of Ethics & Standards', 'CFP Board'] : code === 'CMA' ? ['IMA Statement of Ethical Professional Practice', 'IMA'] : code === 'EA' ? ['Circular 230 Ethics for Tax Practitioners', 'NATP'] : ['Professional Ethics for CPAs', 'AICPA'];
const DELIV = ['Group internet-based', 'Self-study (QAS)', 'Live (in person)', 'Conference'];

// --- minimal, valid one-page PDF certificate ---
function pdf(lines) {
  const esc = s => s.replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '-');
  let y = 470; const parts = ['q 0.36 0.35 0.9 RG 3 w 36 36 720 540 re S Q', 'q 0.36 0.35 0.9 rg 36 520 720 56 re f Q', 'BT /F2 20 Tf 1 1 1 rg 60 540 Td (HARBOR & PINE CPAs  -  CERTIFICATE OF COMPLETION) Tj ET'.replace('&', 'and')];
  lines.forEach(([size, text, font]) => { parts.push(`BT /${font || 'F1'} ${size} Tf 0.1 0.1 0.15 rg 60 ${y} Td (${esc(text)}) Tj ET`); y -= size + 18; });
  const stream = parts.join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
function attach(userId, entryId, person, title, provider, hours, date, field) {
  const buf = pdf([[14, 'This certifies that'], [28, person, 'F2'], [14, 'has successfully completed'], [20, title, 'F2'],
    [12, `Sponsor: ${provider}    Field of study: ${field}    CPE credits: ${hours}`], [12, `Date completed: ${date}    Certificate no. ${crypto.randomBytes(4).toString('hex').toUpperCase()}`],
    [10, 'Sample certificate generated for the Credentia demo environment.']]);
  const uuid = crypto.randomUUID(); const stored = uuid + '.pdf';
  fs.writeFileSync(path.join(UPLOADS, stored), buf, { mode: 0o600 });
  const fname = `${title.replace(/[^\w ]+/g, '').replace(/\s+/g, '_')}_certificate.pdf`;
  db.prepare("INSERT INTO files(uuid,user_id,ce_entry_id,original_name,stored_name,mime,size,sha256,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,'application/pdf',?,?,?,?)")
    .run(uuid, userId, entryId, fname, stored, buf.length, crypto.createHash('sha256').update(buf).digest('hex'), userId, date + ' 17:30:00');
}

let rnd = 42; const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
const creds = [];
const insUser = db.prepare('INSERT INTO users(email,name,password_hash,role,title,office) VALUES(?,?,?,?,?,?)');
const insCert = db.prepare('INSERT INTO user_certs(user_id,cert_type_id,jurisdiction,licence_number,cycle_start,expiry_date,hours_required,ethics_required) VALUES(?,?,?,?,?,?,?,?)');
const insCE = db.prepare('INSERT INTO ce_entries(user_id,user_cert_id,title,provider,field,delivery,completed_date,hours,ethics_hours,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');

db.transaction(() => {
  for (const [name, title, office, role, demo, lics] of people) {
    const email = name.toLowerCase().replace(/’/g, '').split(' ').join('.').replace(/[^a-z.]/g, '') + D;
    // Stable demo passwords from env (so logins survive restarts on ephemeral hosts); random otherwise.
    const pw = (role === 'admin' ? process.env.DEMO_ADMIN_PASSWORD : process.env.DEMO_STAFF_PASSWORD) || crypto.randomBytes(9).toString('base64url') + '-Ce7';
    const uid = insUser.run(email, name, bcrypt.hashSync(pw, 12), role, title, office).lastInsertRowid;
    creds.push({ name, email, role, pw, demo });
    for (const [code, juris, dte, frac, ethicsDone] of lics) {
      const t = typeBy[code]; const expiry = addDays(T, dte); const start = addMonths(expiry, -t[3]);
      const num = code.startsWith('CPA') ? String(100000 + Math.floor(rand() * 899999)) : code + '-' + String(10000 + Math.floor(rand() * 89999));
      const cid = insCert.run(uid, typeId[code], juris, num, start, expiry, t[4], t[5]).lastInsertRowid;
      const lastDay = expiry < T ? expiry : T; const span = Math.max(1, daysBetween(start, lastDay));
      let target = Math.round(t[4] * frac * 2) / 2; let ethicsNeeded = t[5];
      if (ethicsNeeded && (ethicsDone || frac >= 1)) {
        const [et, ep] = ethicsCourse(code); const d = addDays(start, Math.floor(span * (0.3 + rand() * 0.6)));
        const id = insCE.run(uid, cid, et, ep, 'Ethics', 'Group internet-based', d, ethicsNeeded, ethicsNeeded, uid, d + ' 18:00:00').lastInsertRowid;
        attach(uid, id, name, et, ep, ethicsNeeded, d, 'Ethics'); target -= ethicsNeeded;
      }
      const list = pool(code); let i = Math.floor(rand() * list.length);
      while (target > 0) {
        const [ct, cp, cf, ch] = list[i++ % list.length]; const h = Math.min(ch, target);
        const d = addDays(start, Math.floor(span * rand()));
        const id = insCE.run(uid, cid, `${ct}${i > list.length ? ' — Part ' + Math.ceil(i / list.length) : ''}`, cp, cf, DELIV[Math.floor(rand() * DELIV.length)], d, h, 0, uid, d + ' 18:00:00').lastInsertRowid;
        if (rand() < 0.82) attach(uid, id, name, ct, cp, h, d, cf);
        target -= h;
      }
    }
  }
})();

// Backfill realistic reminder history for windows already passed, then let the live scheduler send what's due today.
for (const c of loadCerts()) {
  const current = c.days < 0 ? -1 : THRESHOLDS.find(t => c.days <= t);
  for (const t of THRESHOLDS.slice().reverse()) {
    if (c.days < t && t !== current) { const d = addDays(c.expiry_date, -t); if (d < T) deliver({ ...c, days: t }, 'd' + t, 'scheduler', d + ' 13:00:00'); }
  }
  if (c.days < 0) for (let d = addDays(c.expiry_date, 1); daysBetween(d, T) >= 7; d = addDays(d, 7)) deliver({ ...c, days: daysBetween(T, c.expiry_date) + daysBetween(d, T) }, 'overdue', 'scheduler', d + ' 13:00:00');
}
const sent = runReminders('scheduler');

const file = path.join(process.env.STORAGE_DIR || path.join(__dirname, '..'), 'DEMO_CREDENTIALS.md');
const lines = ['# Credentia — demo accounts', '', 'Demo environment only. Passwords were randomly generated at seed time; each user can change theirs under **Account**.', '',
  '| Name | Role | Email | Password |', '|---|---|---|---|',
  ...creds.sort((a, b) => (b.demo - a.demo) || a.role.localeCompare(b.role)).map(c => `| ${c.name}${c.demo ? ' ⭐' : ''} | ${c.role} | ${c.email} | \`${c.pw}\` |`), '',
  '⭐ = suggested demo logins (admin + staff with a mix of current / due soon / expired licences).'];
fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log(`Seeded ${creds.length} people, ${db.prepare('SELECT COUNT(*) c FROM user_certs').get().c} licences, ${db.prepare('SELECT COUNT(*) c FROM ce_entries').get().c} CE entries, ${db.prepare('SELECT COUNT(*) c FROM files').get().c} certificates; ${sent} reminders sent now. Credentials: ${file}`);
