'use strict';
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const STORAGE = process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
const UPLOADS = path.join(STORAGE, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true, mode: 0o700 });

const db = new Database(path.join(STORAGE, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','staff')),
  title TEXT, office TEXT, active INTEGER NOT NULL DEFAULT 1, last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS cert_types(
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, issuer TEXT,
  cycle_months INTEGER NOT NULL, hours_required REAL NOT NULL, ethics_required REAL NOT NULL DEFAULT 0, notes TEXT);
CREATE TABLE IF NOT EXISTS user_certs(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cert_type_id INTEGER NOT NULL REFERENCES cert_types(id), jurisdiction TEXT, licence_number TEXT,
  cycle_start TEXT NOT NULL, expiry_date TEXT NOT NULL, hours_required REAL NOT NULL,
  ethics_required REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS ce_entries(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_cert_id INTEGER REFERENCES user_certs(id) ON DELETE SET NULL, title TEXT NOT NULL, provider TEXT,
  field TEXT, delivery TEXT, completed_date TEXT NOT NULL, hours REAL NOT NULL, ethics_hours REAL NOT NULL DEFAULT 0,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY, uuid TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ce_entry_id INTEGER REFERENCES ce_entries(id) ON DELETE CASCADE, original_name TEXT NOT NULL, stored_name TEXT NOT NULL,
  mime TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL, uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS outbox(
  id INTEGER PRIMARY KEY, to_email TEXT NOT NULL, cc TEXT, subject TEXT NOT NULL, body_text TEXT NOT NULL,
  transport TEXT NOT NULL, status TEXT NOT NULL, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS reminders(
  id INTEGER PRIMARY KEY, user_cert_id INTEGER NOT NULL REFERENCES user_certs(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL, cycle_expiry TEXT NOT NULL, kind TEXT NOT NULL, days_left INTEGER,
  outbox_id INTEGER REFERENCES outbox(id), triggered_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, detail TEXT, ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attestations(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL, confirmed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS ix_uc_user ON user_certs(user_id);
CREATE INDEX IF NOT EXISTS ix_ce_user ON ce_entries(user_id);
CREATE INDEX IF NOT EXISTS ix_rem_uc ON reminders(user_cert_id, cycle_expiry, kind);
CREATE INDEX IF NOT EXISTS ix_attest_user ON attestations(user_id, confirmed_at DESC);
`);

// Migrations for DBs created before compliance_color / settings / attestations existed.
(function migrate() {
  const cols = db.prepare('PRAGMA table_info(user_certs)').all().map(c => c.name);
  if (!cols.includes('compliance_color')) {
    db.exec("ALTER TABLE user_certs ADD COLUMN compliance_color TEXT NOT NULL DEFAULT 'auto'");
  }
  db.prepare("INSERT OR IGNORE INTO settings(key, value) VALUES('cpe_folder_path', ?)").run('Z:\\Shared\\Internal\\CPE');
})();

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(STORAGE, 'session.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

function audit(userId, action, detail, ip) {
  db.prepare('INSERT INTO audit(user_id,action,detail,ip) VALUES(?,?,?,?)').run(userId || null, action, detail || null, ip || null);
}

function getSetting(key, fallback = '') {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return r ? r.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value);
}

module.exports = { db, STORAGE, UPLOADS, secret, audit, getSetting, setSetting };
