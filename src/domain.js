'use strict';
const { db } = require('./db');
const DAY = 86400000;

function todayISO() {
  if (process.env.TODAY) return process.env.TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / DAY); }
function addDays(s, n) { return new Date(parseISO(s) + n * DAY).toISOString().slice(0, 10); }
function addMonths(s, n) { const [y, m, d] = s.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + n, d)); return dt.toISOString().slice(0, 10); }
function isISODate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parseISO(s)) && new Date(parseISO(s)).toISOString().slice(0, 10) === s; }

function evaluate(uc, entries) {
  const inCycle = entries.filter(e => e.user_id === uc.user_id && e.completed_date >= uc.cycle_start && e.completed_date <= uc.expiry_date && (e.user_cert_id == null || e.user_cert_id === uc.id));
  const hours = round(inCycle.reduce((a, e) => a + e.hours, 0));
  const ethics = round(inCycle.reduce((a, e) => a + e.ethics_hours, 0));
  const days = daysBetween(todayISO(), uc.expiry_date);
  const hoursShort = round(Math.max(0, uc.hours_required - hours));
  const ethicsShort = round(Math.max(0, uc.ethics_required - ethics));
  const complete = hoursShort === 0 && ethicsShort === 0;
  let status = 'current';
  if (days < 0) status = 'expired';
  else if (days <= 90 || (!complete && days <= 180)) status = 'due';
  const pct = uc.hours_required ? Math.min(100, Math.round((hours / uc.hours_required) * 100)) : 100;
  return { ...uc, hours, ethics, hoursShort, ethicsShort, complete, days, status, pct, entryCount: inCycle.length };
}
function round(n) { return Math.round(n * 100) / 100; }

const CERT_SQL = `SELECT uc.*, u.name AS person, u.email, u.office, u.active, ct.code, ct.name AS type_name, ct.issuer
  FROM user_certs uc JOIN users u ON u.id = uc.user_id JOIN cert_types ct ON ct.id = uc.cert_type_id`;

function loadCerts({ userId, id } = {}) {
  let sql = CERT_SQL; const args = [];
  const where = [];
  if (userId) { where.push('uc.user_id = ?'); args.push(userId); }
  if (id) { where.push('uc.id = ?'); args.push(id); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY uc.expiry_date ASC';
  const certs = db.prepare(sql).all(...args);
  const entries = userId
    ? db.prepare('SELECT * FROM ce_entries WHERE user_id = ?').all(userId)
    : db.prepare('SELECT * FROM ce_entries').all();
  return certs.map(c => evaluate(c, entries));
}

const STATUS_LABEL = { current: 'Current', due: 'Due soon', expired: 'Expired' };
module.exports = { todayISO, daysBetween, addDays, addMonths, isISODate, evaluate, loadCerts, STATUS_LABEL, parseISO };
