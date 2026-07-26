// Kleine UI-Interaktionen (Mengen-Stepper)
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.qty button[data-step]');
  if (!btn) return;
  const input = btn.parentElement.querySelector('input[type="number"]');
  if (!input) return;
  const step = parseInt(btn.dataset.step, 10);
  const min = parseInt(input.min || '1', 10);
  const max = parseInt(input.max || '999999', 10);
  input.value = Math.min(max, Math.max(min, (parseInt(input.value, 10) || min) + step));
});

// Flash nach einigen Sekunden ausblenden
window.addEventListener('DOMContentLoaded', function () {
  const flash = document.querySelector('.flash');
  if (flash) setTimeout(() => { flash.style.transition = 'opacity .4s'; flash.style.opacity = '0'; }, 4500);
});

// Konto-Dropdown schließen, wenn außerhalb geklickt wird
document.addEventListener('click', function (e) {
  document.querySelectorAll('.acct-menu.open').forEach(function (m) {
    if (!m.contains(e.target)) m.classList.remove('open');
  });
});

// Produkt-Mengensteuerung: sanfter roter Hinweis statt Browser-Validierung
(function () {
  var inp = document.getElementById('qtyInput');
  if (!inp || !inp.dataset.max) return;
  var max = parseInt(inp.dataset.max, 10);
  var min = parseInt(inp.min || '1', 10);
  var hint = document.getElementById('qtyHint');
  var box = inp.closest('.qty');
  var hideT;
  function show(on) {
    if (hint) hint.classList.toggle('show', on);
    inp.classList.toggle('at-max', on);
    if (on) { clearTimeout(hideT); hideT = setTimeout(function () { if (hint) hint.classList.remove('show'); inp.classList.remove('at-max'); }, 6000); }
  }
  if (box) box.querySelectorAll('.qbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      var dir = parseInt(b.dataset.dir, 10);
      var cur = parseInt(inp.value, 10); if (isNaN(cur)) cur = min;
      if (dir > 0 && cur >= max) { inp.value = max; show(true); return; }
      var v = cur + dir;
      if (v < min) v = min;
      if (v >= max) { v = max; show(true); } else { show(false); }
      inp.value = v;
    });
  });
  inp.addEventListener('input', function () {
    var v = parseInt(inp.value, 10);
    if (!isNaN(v) && v > max) { inp.value = max; show(true); } else if (!isNaN(v) && v <= max) { show(false); }
  });
  inp.addEventListener('blur', function () {
    var v = parseInt(inp.value, 10);
    if (isNaN(v) || v < min) inp.value = min;
    else if (v > max) { inp.value = max; show(true); }
  });
})();

// Laufender Promo-/Job-Banner (variable Anzeigedauer je Slide)
(function () {
  var bar = document.getElementById('promoBar');
  if (!bar) return;
  var slides = bar.querySelectorAll('.promo-slide');
  if (slides.length < 2) return;
  var i = 0;
  function schedule() {
    var dur = parseInt(slides[i].getAttribute('data-dur'), 10) || 4000;
    setTimeout(function () {
      slides[i].classList.remove('is-active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('is-active');
      schedule();
    }, dur);
  }
  schedule();
})();

// ===== Warenkorb: AJAX-Hinzufügen (kein Reload) + moderne Benachrichtigung =====
(function () {
  function host() {
    var h = document.getElementById('toastHost');
    if (!h) { h = document.createElement('div'); h.id = 'toastHost'; document.body.appendChild(h); }
    return h;
  }
  function toast(msg, type) {
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'ok');
    el.innerHTML = '<span class="toast-ic">' + (type === 'warn' ? '!' : '\u2713') + '</span>'
      + '<span class="toast-body"><span class="toast-msg"></span>'
      + (type === 'warn' ? '' : '<a class="toast-link" href="/warenkorb">Warenkorb ansehen \u25B8</a>') + '</span>'
      + '<button class="toast-x" type="button" aria-label="Schliessen">\u00D7</button>';
    el.querySelector('.toast-msg').textContent = msg;
    host().appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    var t = setTimeout(close, type === 'warn' ? 4800 : 3600);
    function close() { clearTimeout(t); el.classList.remove('show'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 350); }
    el.querySelector('.toast-x').addEventListener('click', close);
  }
  function pulseCart() {
    var c = document.getElementById('cartLink'); if (!c) return;
    c.classList.remove('cart-pulse'); void c.offsetWidth; c.classList.add('cart-pulse');
    setTimeout(function () { c.classList.remove('cart-pulse'); }, 900);
  }
  function updateCart(d) {
    var b = document.getElementById('cartBadge'); if (b) b.textContent = d.count;
    var s = document.getElementById('cartSum');
    if (s) { if (d.count > 0) { s.textContent = d.totalFormatted; s.style.display = ''; } else { s.style.display = 'none'; } }
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.getAttribute) return;
    var action = form.getAttribute('action') || '';
    if (action.indexOf('/warenkorb/hinzufuegen') === -1) return;
    e.preventDefault();
    var btn = form.querySelector('button[type="submit"]');
    var fd = new FormData(form);
    if (btn) { btn.disabled = true; }
    fetch(action, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'fetch' }, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Unerwartete Antwort vom Server.' }; }); })
      .then(function (d) {
        if (btn) { btn.disabled = false; }
        if (d && d.ok) { updateCart(d); pulseCart(); toast(d.message || 'Artikel wurde in den Warenkorb gelegt.', 'ok'); }
        else { toast((d && d.error) || 'Bitte pruefen Sie Ihre Auswahl.', 'warn'); }
      })
      .catch(function () { if (btn) { btn.disabled = false; } toast('Netzwerkfehler \u2013 bitte erneut versuchen.', 'warn'); });
  });
})();

// ===== Hell-/Dunkel-Modus umschalten (Shop + Admin) =====
(function () {
  var toggles = document.querySelectorAll('.theme-toggle');
  if (!toggles.length) return;
  function set(dark) {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('gb-theme', dark ? 'dark' : 'light'); } catch (e) {}
  }
  toggles.forEach(function (b) {
    b.addEventListener('click', function () {
      set(!document.documentElement.classList.contains('dark'));
    });
  });
})();

// ===== Formular-Validierung mit sichtbaren Meldungen (statt Browser-Popup) =====
(function () {
  function emailOk(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v); }
  function wrap(el) { return el.closest('.field') || el.closest('.checkline') || el.parentElement; }
  function clearErr(el) {
    el.classList.remove('invalid');
    var w = wrap(el); if (!w) return;
    var e = w.querySelector('.field-err'); if (e) e.remove();
  }
  function setErr(el, msg) {
    el.classList.add('invalid');
    var w = wrap(el); if (!w) return;
    if (!w.querySelector('.field-err')) {
      var s = document.createElement('div'); s.className = 'field-err'; s.textContent = msg; w.appendChild(s);
    }
  }
  function validate(form) {
    var bad = [], first = null, seenRadio = {};
    // Zuerst alle alten Markierungen entfernen (wichtig u. a. für Radio-Gruppen)
    form.querySelectorAll('.field-err').forEach(function (e) { e.remove(); });
    form.querySelectorAll('.invalid').forEach(function (e) { e.classList.remove('invalid'); });
    var fields = form.querySelectorAll('input[required], select[required], textarea[required]');
    fields.forEach(function (f) {
      if (f.type === 'checkbox') {
        if (!f.checked) { setErr(f, 'Bitte bestätigen.'); bad.push(f); if (!first) first = f; }
        return;
      }
      if (f.type === 'radio') {
        if (seenRadio[f.name]) return; seenRadio[f.name] = 1;
        var grp = form.querySelectorAll('input[type="radio"][name="' + f.name + '"]'), ck = false;
        grp.forEach(function (g) { if (g.checked) ck = true; });
        if (!ck) { setErr(f, 'Bitte treffen Sie eine Auswahl.'); bad.push(f); if (!first) first = f; }
        return;
      }
      if (f.type !== 'hidden' && f.offsetParent === null) return; // unsichtbar -> überspringen
      var val = (f.value || '').trim();
      if (!val) { setErr(f, 'Dieses Feld bitte ausfüllen.'); bad.push(f); if (!first) first = f; return; }
      if (f.type === 'email' && !emailOk(val)) { setErr(f, 'Bitte eine gültige E-Mail-Adresse eingeben.'); bad.push(f); if (!first) first = f; return; }
      var ml = parseInt(f.getAttribute('minlength') || '0', 10);
      if (ml && val.length < ml) { setErr(f, 'Bitte mindestens ' + ml + ' Zeichen eingeben.'); bad.push(f); if (!first) first = f; return; }
    });
    function matchCheck(aName, bName) {
      var a = form.querySelector('[name="' + aName + '"]'), b = form.querySelector('[name="' + bName + '"]');
      if (a && b && a.value && b.value && a.value !== b.value) { setErr(b, 'Die Passwörter stimmen nicht überein.'); bad.push(b); if (!first) first = b; }
    }
    matchCheck('password', 'password2');
    matchCheck('new', 'new2');
    return { ok: bad.length === 0, first: first };
  }
  document.querySelectorAll('form[data-validate]').forEach(function (form) {
    form.setAttribute('novalidate', '');
    var sum = document.createElement('div'); sum.className = 'form-error-summary'; sum.style.display = 'none';
    form.addEventListener('submit', function (e) {
      var r = validate(form);
      if (!r.ok) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"], [type="submit"]');
        sum.textContent = 'Bitte füllen Sie die rot markierten Pflichtfelder aus.';
        if (btn && btn.parentNode) btn.parentNode.insertBefore(sum, btn); else form.appendChild(sum);
        sum.style.display = '';
        if (r.first) { try { r.first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {} try { r.first.focus({ preventScroll: true }); } catch (_) { r.first.focus(); } }
      } else { sum.style.display = 'none'; }
    });
    form.addEventListener('input', function (e) { if (e.target && e.target.matches && e.target.matches('input,select,textarea')) clearErr(e.target); });
    form.addEventListener('change', function (e) { if (e.target && e.target.matches && e.target.matches('input,select,textarea')) clearErr(e.target); });
  });
})();

// Add-to-Cart: native Pflichtfeld-Popups unterdrücken – die Farbwahl-Meldung
// kommt als schöner Toast vom Server, nicht als englisches Browser-Popup.
(function () {
  document.querySelectorAll('form[action*="/warenkorb/hinzufuegen"]').forEach(function (f) { f.setAttribute('novalidate', ''); });
})();

// ===== "Passwort anzeigen"-Umschalter für alle Passwortfelder =====
(function () {
  var EYE = '<svg class="ic-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>'
    + '<svg class="ic-eye-off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18"/><path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2"/><path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c7 0 10.5 7 10.5 7a17 17 0 0 1-3.2 4M6.2 6.2A17 17 0 0 0 1.5 12S5 19 12 19c1 0 1.9-.1 2.8-.4"/></svg>';
  document.querySelectorAll('input[type="password"]').forEach(function (inp) {
    if (inp.dataset.pwOn) return; inp.dataset.pwOn = '1';
    var wrap = document.createElement('div'); wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pw-toggle'; btn.title = 'Passwort anzeigen'; btn.setAttribute('aria-label', 'Passwort anzeigen');
    btn.innerHTML = EYE; wrap.appendChild(btn);
    btn.addEventListener('click', function () {
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.classList.toggle('on', show);
      var t = show ? 'Passwort verbergen' : 'Passwort anzeigen';
      btn.title = t; btn.setAttribute('aria-label', t);
    });
  });
})();

/* ===== Mobiles Off-Canvas-Menü (Burger) ===== */
(function () {
  var burger = document.getElementById('navBurger');
  var drawer = document.getElementById('mobileNav');
  var backdrop = document.getElementById('mnavBackdrop');
  var closeBtn = document.getElementById('mnavClose');
  if (!burger || !drawer || !backdrop) return;

  function open() {
    document.body.classList.add('mnav-open');
    drawer.classList.add('is-open');
    backdrop.hidden = false;
    // Repaint-Trick, damit die Transition greift
    requestAnimationFrame(function () { backdrop.classList.add('is-on'); });
    burger.classList.add('is-x');
    burger.setAttribute('aria-expanded', 'true');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function close() {
    document.body.classList.remove('mnav-open');
    drawer.classList.remove('is-open');
    backdrop.classList.remove('is-on');
    burger.classList.remove('is-x');
    burger.setAttribute('aria-expanded', 'false');
    drawer.setAttribute('aria-hidden', 'true');
    var bd = backdrop;
    setTimeout(function () { if (!document.body.classList.contains('mnav-open')) bd.hidden = true; }, 300);
  }
  function toggle() { drawer.classList.contains('is-open') ? close() : open(); }

  burger.addEventListener('click', toggle);
  if (closeBtn) closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);
  // Klick auf einen Link schließt das Menü
  drawer.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
  // Escape schließt
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && drawer.classList.contains('is-open')) close(); });
  // Wird das Fenster über den Breakpoint hinaus breit gezogen: sauber schließen
  window.addEventListener('resize', function () { if (window.innerWidth > 1080 && drawer.classList.contains('is-open')) close(); });
})();
