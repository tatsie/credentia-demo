'use strict';
// Usage: node src/seed.js [--reset]   Seeds demo data and writes DEMO_CREDENTIALS.md (chmod 600).
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const STORAGE = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
if (process.argv.includes('--reset')) { fs.rmSync(STORAGE, { recursive: true, force: true }); }
const { db, UPLOADS } = require('./db');
const bcrypt = require('bcryptjs');
const { todayISO, addDays, addMonths, loadCerts, daysBetween } = require('./domain');
const { deliver, runReminders, THRESHOLDS } = require('./reminders');

console.log(`[seed] DEMO_ADMIN_PASSWORD present: ${process.env.DEMO_ADMIN_PASSWORD ? 'yes' : 'no'}; DEMO_STAFF_PASSWORD present: ${process.env.DEMO_STAFF_PASSWORD ? 'yes' : 'no'}`);
if (db.prepare('SELECT COUNT(*) c FROM users').get().c) {
  // Existing DB: on every boot, re-apply the demo admin password from env so a changed value always takes effect.
  if (process.env.DEMO_ADMIN_PASSWORD) {
    const n = db.prepare("UPDATE users SET password_hash=? WHERE role='admin'").run(bcrypt.hashSync(process.env.DEMO_ADMIN_PASSWORD, 12)).changes;
    console.log(`[seed] Database already seeded; reset password for ${n} admin account(s) from DEMO_ADMIN_PASSWORD.`);
  } else console.log('Database already seeded. Use --reset to start over.');
  // Ensure default CPE folder path setting exists on older DBs.
  db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('cpe_folder_path', ?)").run('Z:\\Shared\\Internal\\CPE');
  process.exit(0);
}
const T = todayISO();
const D = '@harborpine.example';

// Client licence catalogue (Grobstein Teeple). Notes marked "example rules — verify" where published CPE rules vary or are uncertain.
const types = [
  ['ABV', 'Accredited in Business Valuation', 'AICPA', 36, 60, 0, 'Example rules — verify: valuation-related CPE over 3 years'],
  ['AICPA', 'AICPA Membership', 'AICPA', 12, 0, 0, 'Example rules — verify: annual membership; CPE tracked via other credentials'],
  ['ASA-REAC', 'ASA Reaccreditation', 'American Society of Appraisers', 60, 100, 0, 'Example rules — verify: reaccreditation CPE over 5 years'],
  ['ASA', 'Accredited Senior Appraiser', 'American Society of Appraisers', 60, 100, 0, 'Example rules — verify: ASA designation CPE'],
  ['BVIUK', 'BVIUK Expert Membership', 'Business Valuation Institute UK', 12, 20, 0, 'Example rules — verify: annual CPD for expert membership'],
  ['CAMS', 'Certified Anti-Money Laundering Specialist', 'ACAMS', 36, 60, 0, 'Example rules — verify: 60 CPE credits over 3 years'],
  ['CFA', 'Chartered Financial Analyst', 'CFA Institute', 12, 20, 0, 'Example rules — verify: 20 hours/year incl. 2 hours Standards'],
  ['CFF', 'Certified in Financial Forensics', 'AICPA', 36, 60, 0, 'Example rules — verify: forensic-related CPE over 3 years'],
  ['CIRA', 'Certified Insolvency and Restructuring Advisor', 'AIRA', 36, 60, 0, 'Example rules — verify: AIRA CPE requirements'],
  ['CISSP', 'Certified Information Systems Security Professional', 'ISC2', 36, 120, 0, 'Example rules — verify: 120 CPE over 3 years (40/year typical)'],
  ['CITP', 'Certified Information Technology Professional', 'AICPA', 36, 60, 0, 'Example rules — verify: IT-related CPE over 3 years'],
  ['CMA', 'Certified Management Accountant', 'Institute of Management Accountants', 12, 30, 2, 'Example rules — verify: 30 hours/year incl. 2 ethics'],
  ['CPA-CA', 'CPA — California', 'California Board of Accountancy', 24, 80, 4, 'Example rules — verify: biennial; 4h regulatory review every 6 yrs'],
  ['CPA-NV', 'CPA — Nevada', 'Nevada State Board of Accountancy', 24, 80, 4, 'Example rules — verify: biennial CPE for Nevada CPAs'],
  ['CPA-WA', 'CPA — Washington', 'Washington State Board of Accountancy', 36, 120, 4, 'Example rules — verify: triennial; board-approved ethics'],
  ['CPA-IL', 'CPA — Illinois', 'IDFPR', 36, 120, 4, 'Example rules — verify: triennial CPE for Illinois CPAs'],
  ['CPA-TN', 'CPA — Tennessee', 'Tennessee State Board of Accountancy', 24, 80, 2, 'Example rules — verify: biennial CPE for Tennessee CPAs'],
  ['CVA', 'Certified Valuation Analyst', 'NACVA', 36, 36, 0, 'Example rules — verify: 36 hours over 3 years (valuation)'],
  ['MAFF', 'Master Analyst in Financial Forensics', 'NACVA', 36, 36, 0, 'Example rules — verify: MAFF CPE requirements'],
  ['SIE-79-63', 'SIE, Series 79 & 63', 'FINRA', 36, 0, 0, 'Example rules — verify: FINRA registrations; CE via firm Element programs'],
  ['WSBA', 'WSBA (Washington State Bar Association)', 'Washington State Bar Association', 36, 45, 6, 'Example rules — verify: 45 CLE credits / 3 years incl. ethics'],
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

// [name, title, office, role, demoLogin?, [[code, jurisdiction, daysToExpiry, fractionDone, ethicsDone?, color?], ...]]
// color: 'green' | 'yellow' | 'red' | omit for auto
const people = [
  ['Morgan Ellis', 'Director of Operations', 'San Francisco', 'admin', true, []],
  ['Priya Raman', 'Managing Partner', 'San Francisco', 'admin', false, [
    ['CPA-CA', 'California', 600, 1, true, 'green'],
    ['CPA-NV', 'Nevada', 400, 0.7, true, 'green'],
    ['AICPA', null, 200, 1, false, 'green'],
  ]],
  ['Daniel Okafor', 'Senior Tax Manager', 'San Francisco', 'staff', true, [
    ['CPA-CA', 'California', 25, 0.88, false, 'red'],
    ['CPA-WA', 'Washington', 410, 0.55, true, 'auto'],
    ['CFF', null, 200, 0.8, false, 'green'],
  ]],
  ['Sarah Lindqvist', 'Audit Manager', 'Dallas', 'staff', true, [
    ['CPA-IL', 'Illinois', 85, 1, true, 'green'],
    ['CISSP', null, 300, 0.6, false, 'auto'],
    ['CITP', null, 500, 0, false, 'yellow'],
  ]],
  ['James Whitaker', 'Wealth Advisor', 'Miami', 'staff', true, [
    ['CFA', null, -12, 0.7, false, 'red'],
    ['SIE-79-63', null, 400, 1, false, 'green'],
    ['CPA-TN', 'Tennessee', 115, 0.4, false, 'auto'],
  ]],
  ['Elena Marquez', 'Valuation Partner', 'Chicago', 'staff', false, [
    ['CMA', null, 58, 1, true, 'green'],
    ['ABV', null, 240, 0.7, false, 'auto'],
    ['CVA', null, 180, 0, false, 'yellow'],
    ['ASA', null, 700, 0.3, false, 'auto'],
  ]],
  ['Kevin Cho', 'Forensic Senior', 'San Francisco', 'staff', false, [
    ['MAFF', null, -40, 0.5, false, 'red'],
    ['CIRA', null, 365, 0, false, 'yellow'],
    ['CAMS', null, 200, 0.9, false, 'green'],
  ]],
  ['Aisha Bello', 'IT Audit Senior', 'Seattle', 'staff', false, [
    ['CISSP', null, 150, 0.85, false, 'green'],
    ['CPA-WA', 'Washington', 700, 0.3, false, 'auto'],
    ['WSBA', 'Washington', 90, 0.5, false, 'red'],
  ]],
  ['Tom Brennan', 'Valuation Partner', 'San Francisco', 'staff', false, [
    ['CPA-CA', 'California', 330, 1, true, 'green'],
    ['ABV', null, 240, 0.7, false, 'auto'],
    ['ASA-REAC', null, 500, 0, false, 'yellow'],
    ['BVIUK', null, 100, 0.8, false, 'green'],
  ]],
  ['Rachel Kim', 'Audit Senior', 'Chicago', 'staff', false, [
    ['CPA-IL', 'Illinois', 95, 0.9, true, 'auto'],
    ['AICPA', null, 60, 1, false, 'green'],
  ]],
  ['Marcus Webb', 'Tax Manager', 'Las Vegas', 'staff', false, [
    ['CPA-NV', 'Nevada', 260, 0.9, true, 'green'],
    ['CPA-CA', 'California', 500, 0.5, false, 'auto'],
  ]],
  ['Hannah Fischer', 'Assurance Manager', 'Nashville', 'staff', false, [
    ['CPA-TN', 'Tennessee', 180, 1, true, 'green'],
    ['CFF', null, 400, 0, false, 'yellow'],
  ]],
  ['Liam O’Connor', 'FP&A Consultant', 'Chicago', 'staff', false, [
    ['CMA', null, 20, 0.6, false, 'red'],
    ['CFA', null, 300, 0, false, 'yellow'],
  ]],
  ['Grace Nakamura', 'Tax Senior', 'San Francisco', 'staff', false, [
    ['CPA-CA', 'California', 450, 0.7, true, 'auto'],
    ['CAMS', null, 600, 0.4, false, 'auto'],
  ]],
  ['Omar Haddad', 'Tax Senior', 'Seattle', 'staff', false, [
    ['CPA-WA', 'Washington', 620, 0.35, false, 'auto'],
    ['CPA-TN', 'Tennessee', 365, 0.8, true, 'green'],
    ['SIE-79-63', null, 200, 1, false, 'green'],
  ]],
];

const courses = {
  tax: [['Federal Tax Update', 'AICPA', 'Taxation', 8], ['Partnership Taxation Deep Dive', 'Surgent', 'Taxation', 4], ['S Corporation Basis & Distributions', 'Becker', 'Taxation', 3], ['State & Local Tax Nexus After Wayfair', 'CalCPA', 'Taxation', 2], ['IRS Practice & Procedure', 'NATP', 'Taxation', 4], ['Estate & Gift Tax Planning', 'AICPA', 'Taxation', 6]],
  audit: [['Yellow Book Update', 'AICPA', 'Auditing', 4], ['Risk Assessment Standards (SAS 145)', 'Becker', 'Auditing', 3], ['Revenue Recognition (ASC 606) in Practice', 'Surgent', 'Accounting', 4], ['Lease Accounting (ASC 842) Refresher', 'AICPA', 'Accounting', 2], ['Audit Data Analytics', 'ISACA', 'Information Technology', 6]],
  it: [['SOC 2 Reporting Essentials', 'AICPA', 'Information Technology', 4], ['Cloud Controls & Shared Responsibility', 'ISC2', 'Information Technology', 8], ['Cybersecurity Risk Management', 'ISC2', 'Information Technology', 6], ['IT General Controls Testing', 'Becker', 'Auditing', 4]],
  plan: [['Retirement Income Planning', 'CFA Institute', 'Finance', 3], ['Behavioral Finance for Advisors', 'CFA Institute', 'Finance', 2], ['Insurance Planning Update', 'The American College', 'Finance', 2], ['Investment Policy Statements', 'CFA Institute', 'Finance', 2]],
  mgmt: [['Strategic Cost Management', 'IMA', 'Management Advisory', 4], ['Data Visualization for Finance', 'IMA', 'Information Technology', 3], ['Forecasting & Scenario Planning', 'IMA', 'Finance', 4], ['Leadership for Finance Managers', 'AICPA', 'Personal Development', 2]],
  val: [['Business Valuation Fundamentals', 'AICPA', 'Specialized Knowledge', 8], ['Discount for Lack of Marketability', 'NACVA', 'Specialized Knowledge', 4], ['Forensic Accounting & Fraud Schemes', 'ACFE', 'Specialized Knowledge', 6], ['Litigation Support Engagements', 'AICPA', 'Specialized Knowledge', 4]],
  aml: [['AML Program Essentials', 'ACAMS', 'Specialized Knowledge', 8], ['Sanctions Screening Update', 'ACAMS', 'Regulatory Ethics', 4], ['BSA/AML Examination Trends', 'ACAMS', 'Specialized Knowledge', 6]],
  law: [['Ethics for Washington Lawyers', 'WSBA', 'Ethics', 3], ['Business Law Update', 'WSBA', 'Business Law', 4], ['Professional Responsibility', 'WSBA', 'Ethics', 3]],
};
const pool = code => {
  if (code.startsWith('CPA')) return [...courses.tax, ...courses.audit];
  if (code === 'CISSP' || code === 'CITP') return courses.it;
  if (code === 'CFA' || code === 'SIE-79-63') return courses.plan;
  if (code === 'CMA') return courses.mgmt;
  if (code === 'CAMS') return courses.aml;
  if (code === 'WSBA') return courses.law;
  if (code === 'AICPA') return [...courses.audit, ...courses.tax];
  return courses.val;
};
const ethicsCourse = code => code === 'CMA' ? ['IMA Statement of Ethical Professional Practice', 'IMA'] : code === 'WSBA' ? ['Ethics for Washington Lawyers', 'WSBA'] : code === 'CFA' ? ['CFA Institute Code of Ethics & Standards', 'CFA Institute'] : ['Professional Ethics for CPAs', 'AICPA'];
const DELIV = ['Group internet-based', 'Self-study (QAS)', 'Live (in person)', 'Conference'];

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
const insCert = db.prepare('INSERT INTO user_certs(user_id,cert_type_id,jurisdiction,licence_number,cycle_start,expiry_date,hours_required,ethics_required,compliance_color,notes) VALUES(?,?,?,?,?,?,?,?,?,?)');
const insCE = db.prepare('INSERT INTO ce_entries(user_id,user_cert_id,title,provider,field,delivery,completed_date,hours,ethics_hours,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
const insAttest = db.prepare('INSERT INTO attestations(user_id,statement,confirmed_at,ip) VALUES(?,?,?,?)');

db.transaction(() => {
  for (const [name, title, office, role, demo, lics] of people) {
    const email = name.toLowerCase().replace(/’/g, '').split(' ').join('.').replace(/[^a-z.]/g, '') + D;
    const pw = (role === 'admin' ? process.env.DEMO_ADMIN_PASSWORD : process.env.DEMO_STAFF_PASSWORD) || crypto.randomBytes(9).toString('base64url') + '-Ce7';
    const uid = insUser.run(email, name, bcrypt.hashSync(pw, 12), role, title, office).lastInsertRowid;
    creds.push({ name, email, role, pw, demo });
    for (const row of lics) {
      const [code, juris, dte, frac, ethicsDone, color] = row;
      const t = typeBy[code]; const expiry = addDays(T, dte); const start = addMonths(expiry, -t[3]);
      const num = code.startsWith('CPA') ? String(100000 + Math.floor(rand() * 899999)) : code.replace(/[^A-Z0-9]/g, '') + '-' + String(10000 + Math.floor(rand() * 89999));
      const cColor = color || 'auto';
      const note = cColor === 'yellow' ? 'Licence held — renewal period / status not yet provided by holder.' : null;
      const cid = insCert.run(uid, typeId[code], juris, num, start, expiry, t[4], t[5], cColor, note).lastInsertRowid;
      // Yellow = known holder but no usable status info — skip CE so the colour stays meaningful.
      if (cColor === 'yellow' || t[4] === 0) continue;
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
  // Sample attestations for a few staff (PCAOB/AICPA confirm-status requirement).
  const stmt = 'I confirm that I have submitted my CPE completion certificates and that the licences and certifications listed for me in Credentia accurately reflect my current status.';
  for (const email of ['daniel.okafor@harborpine.example', 'sarah.lindqvist@harborpine.example', 'tom.brennan@harborpine.example']) {
    const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
    if (u) insAttest.run(u.id, stmt, addDays(T, -Math.floor(rand() * 20)) + ' 09:15:00', '127.0.0.1');
  }
})();

for (const c of loadCerts()) {
  const current = c.days < 0 ? -1 : THRESHOLDS.find(t => c.days <= t);
  for (const t of THRESHOLDS.slice().reverse()) {
    if (c.days < t && t !== current) { const d = addDays(c.expiry_date, -t); if (d < T) deliver({ ...c, days: t }, 'd' + t, 'scheduler', d + ' 13:00:00'); }
  }
  if (c.days < 0) for (let d = addDays(c.expiry_date, 1); daysBetween(d, T) >= 7; d = addDays(d, 7)) deliver({ ...c, days: daysBetween(T, c.expiry_date) + daysBetween(d, T) }, 'overdue', 'scheduler', d + ' 13:00:00');
}
const sent = runReminders('scheduler');
if (process.env.DEMO_ADMIN_PASSWORD) {
  const h = db.prepare("SELECT password_hash FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  console.log(`[seed] admin password matches DEMO_ADMIN_PASSWORD: ${h && bcrypt.compareSync(process.env.DEMO_ADMIN_PASSWORD, h.password_hash) ? 'yes' : 'NO'}`);
}

const file = path.join(process.env.STORAGE_DIR || path.join(__dirname, '..'), 'DEMO_CREDENTIALS.md');
const lines = ['# Credentia — demo accounts', '', 'Demo environment only. Passwords were randomly generated at seed time; each user can change theirs under **Account**.', '',
  '| Name | Role | Email | Password |', '|---|---|---|---|',
  ...creds.sort((a, b) => (b.demo - a.demo) || a.role.localeCompare(b.role)).map(c => `| ${c.name}${c.demo ? ' ⭐' : ''} | ${c.role} | ${c.email} | \`${c.pw}\` |`), '',
  '⭐ = suggested demo logins (admin + staff with a mix of green / yellow / red compliance colours).'];
fs.writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });
console.log(`Seeded ${creds.length} people, ${db.prepare('SELECT COUNT(*) c FROM user_certs').get().c} licences, ${db.prepare('SELECT COUNT(*) c FROM ce_entries').get().c} CE entries, ${db.prepare('SELECT COUNT(*) c FROM files').get().c} certificates; ${sent} reminders sent now. Credentials: ${file}`);
