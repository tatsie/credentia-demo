'use strict';
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
const esc = s => String(s).replace(/[&<>"'`]/g, c => MAP[c]);
function val(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}
/** Tagged template: every interpolation is HTML-escaped unless it is a Raw (another html`` result). */
function html(strings, ...vals) { let out = strings[0]; for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1]; return new Raw(out); }
const raw = s => new Raw(s);
module.exports = { html, raw, esc, Raw };
