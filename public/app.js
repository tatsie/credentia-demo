(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var tb = $('#themeBtn');
  if (tb) tb.addEventListener('click', function () {
    var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.classList.add('theme-anim'); root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    setTimeout(function () { root.classList.remove('theme-anim'); }, 350);
  });
  var side = $('#side'), scrim = $('#scrim'), mb = $('#menuBtn');
  function toggle(open) { document.body.classList.toggle('nav-open', open); }
  if (mb) mb.addEventListener('click', function () { toggle(!document.body.classList.contains('nav-open')); });
  if (scrim) scrim.addEventListener('click', function () { toggle(false); });
  // clickable table rows
  $$('tr.rowlink').forEach(function (tr) {
    tr.addEventListener('click', function (e) { if (e.target.closest('a,button,form,input')) return; var h = tr.getAttribute('data-href'); if (h && h.charAt(0) === '/') location.href = h; });
  });
  $$('select.auto-submit').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });
  $$('form[data-confirm]').forEach(function (f) { f.addEventListener('submit', function (e) { if (!confirm(f.getAttribute('data-confirm'))) e.preventDefault(); }); });
  // drop zones
  $$('.drop').forEach(function (d) {
    var input = $('input[type=file]', d), label = $('strong', d);
    function show() { var f = input.files && input.files[0]; d.classList.toggle('has', !!f); label.textContent = f ? f.name + ' · ' + Math.max(1, Math.round(f.size / 1024)) + ' KB' : label.getAttribute('data-default'); if (f && f.size > 10 * 1024 * 1024) { d.classList.add('bad'); label.textContent = f.name + ' is larger than 10 MB'; } else d.classList.remove('bad'); }
    input.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.remove('over'); }); });
    d.addEventListener('drop', function (e) { if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; show(); } });
  });
  // licence form: prefill from credential defaults
  var ct = $('#ctype');
  if (ct) ct.addEventListener('change', function () {
    var o = ct.options[ct.selectedIndex]; if (!o || !o.value) return;
    $('#chours').value = o.getAttribute('data-hours'); $('#cethics').value = o.getAttribute('data-ethics');
    var s = $('#cstart').value, m = parseInt(o.getAttribute('data-cycle'), 10);
    if (s && !$('#cexp').value) { var d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + m); $('#cexp').value = d.toISOString().slice(0, 10); }
  });
  // CE form: only show licences belonging to the selected person
  var cu = $('#ceUser'), cc = $('#ceCert');
  function filterCerts() { if (!cu || !cc) return; $$('option[data-user]', cc).forEach(function (o) { var show = o.getAttribute('data-user') === cu.value; o.hidden = !show; o.disabled = !show; if (!show && o.selected) cc.value = ''; }); }
  if (cu) { cu.addEventListener('change', filterCerts); filterCerts(); }
  var fl = $('.flash.f-ok'); if (fl) setTimeout(function () { fl.classList.add('out'); }, 4500);
})();
