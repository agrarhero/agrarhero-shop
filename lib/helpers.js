function euro(cents) {
  const n = (Number(cents || 0) / 100);
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function num(cents) {
  return (Number(cents || 0) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// SQLite-Zeitstempel (UTC "YYYY-MM-DD HH:MM:SS") korrekt als UTC parsen
function parseTs(value) {
  if (!value) return new Date();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(value)) {
    const hasTz = /[zZ]$|[+\-]\d\d:?\d\d$/.test(value);
    return new Date(value.replace(' ', 'T') + (hasTz ? '' : 'Z'));
  }
  return new Date(value);
}
function dateDE(value) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const p = value.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
  return parseTs(value).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
}
// Datum + Uhrzeit in EU-Zeit (Europe/Berlin)
function dateTimeDE(value) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) { const p = value.split('-'); return `${p[2]}.${p[1]}.${p[0]}`; }
  return parseTs(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}
function totals(items, taxRate = 19, shippingNet = 0) {
  const subtotal = items.reduce((s, it) => s + it.unit_cents * it.quantity, 0);
  const shipping = Math.max(0, Math.round(Number(shippingNet) || 0));
  const net = subtotal + shipping;
  const tax = Math.round(net * (taxRate / 100));
  const gross = net + tax;
  const qty = items.reduce((s, it) => s + it.quantity, 0);
  return { subtotal, shipping, net, tax, gross, qty, taxRate };
}
function orderNumber(id) {
  const year = new Date().getFullYear();
  return `GB-${year}-${String(id).padStart(4, '0')}`;
}
function invoiceNumber(id) {
  const year = new Date().getFullYear();
  return `RE-${year}-${String(id).padStart(4, '0')}`;
}
function safeParse(json, fallback) {
  try { return JSON.parse(json); } catch { return fallback; }
}
// Relative Zeitangabe auf Deutsch, z. B. "vor 3 Min.", "vor 2 Std.".
function relTime(value) {
  if (!value) return '—';
  const then = parseTs(value).getTime();
  if (isNaN(then)) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 45) return 'gerade eben';
  const min = Math.floor(sec / 60);
  if (min < 60) return `vor ${min} Min.`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `vor ${hrs} Std.`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `vor ${days} Tag${days === 1 ? '' : 'en'}`;
  return dateDE(value);
}
// Effektive Lieferadresse einer Bestellung: abweichende Lieferadresse (ship_*),
// sonst die Rechnungs-/Kundenadresse (cust_*).
function orderShipping(o) {
  o = o || {};
  const has = o.ship_street && String(o.ship_street).trim();
  if (has) return { different: true, company: o.ship_company || o.cust_company || '', first_name: o.ship_first_name || o.cust_first_name || '', last_name: o.ship_last_name || o.cust_last_name || '', street: o.ship_street || '', zip: o.ship_zip || '', city: o.ship_city || '', country: o.ship_country || '' };
  return { different: false, company: o.cust_company || '', first_name: o.cust_first_name || '', last_name: o.cust_last_name || '', street: o.cust_street || '', zip: o.cust_zip || '', city: o.cust_city || '', country: o.cust_country || '' };
}
// Nur Uhrzeit (Europe/Berlin), z. B. "08:56 Uhr"
function timeDE(value) {
  return parseTs(value).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}
// Datum + Uhrzeit inkl. Sekunden (Europe/Berlin), z. B. "26.07.2026, 16:30:45 Uhr"
function dateTimeSecDE(value) {
  return parseTs(value).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Uhr';
}
// Nur Uhrzeit inkl. Sekunden, z. B. "16:30:45 Uhr"
function timeSecDE(value) {
  return parseTs(value).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' Uhr';
}
// Slug hübsch machen, z. B. "tajfun-egv-85" -> "Tajfun Egv 85"
function prettySlug(s) {
  return String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Produkt';
}
// Klarname einer aufgerufenen Seite/URL (für den Besucher-Verlauf).
function pageLabel(url) {
  const raw = String(url || '/');
  const parts = raw.split('?');
  const path = (parts[0] || '/').replace(/\/+$/, '') || '/';
  let q = null; try { q = new URLSearchParams(parts[1] || ''); } catch (e) { q = new URLSearchParams(''); }
  if (path === '/' || path === '') return 'Startseite';
  if (path === '/produkte') {
    const g = q.get('gruppe');
    if (g) return groupLabel(g);
    if (q.get('suche')) return 'Suche „' + q.get('suche') + '“';
    return 'Alle Produkte (Sortiment)';
  }
  if (path.startsWith('/produkt/')) return 'Produkt · ' + prettySlug(path.slice('/produkt/'.length));
  const M = {
    '/warenkorb': 'Warenkorb', '/kasse': 'Kasse', '/checkout': 'Kasse', '/bestellen': 'Kasse',
    '/kontakt': 'Kontakt', '/login': 'Anmeldung', '/registrieren': 'Registrierung',
    '/passwort-vergessen': 'Passwort vergessen', '/passwort': 'Passwort zurücksetzen',
    '/impressum': 'Impressum', '/agb': 'AGB', '/datenschutz': 'Datenschutz',
    '/karriere': 'Karriere', '/bestaetigen': 'E-Mail-Bestätigung',
    '/konto': 'Kundenkonto · Übersicht', '/konto/bestellungen': 'Kundenkonto · Bestellungen',
    '/konto/daten': 'Kundenkonto · Meine Daten', '/konto/passwort': 'Kundenkonto · Passwort'
  };
  if (M[path]) return M[path];
  if (path.startsWith('/konto/bestellungen/')) return 'Kundenkonto · Bestelldetail';
  if (path.startsWith('/konto')) return 'Kundenkonto';
  return path;
}
// Anzeigename einer Produktgruppe (Kategorie).
function groupLabel(g) {
  return ({ guellefass: 'Güllefässer / Wasserwagen', seilwinde: 'Seilwinden', saege: 'Sägen', erntebox: 'Ernteboxen' })[g] || 'Unser Sortiment';
}
function groupLabelSingular(g) {
  return ({ guellefass: 'Güllefass', seilwinde: 'Seilwinde', saege: 'Säge', erntebox: 'Erntebox' })[g] || 'Produkt';
}
// Stabile, zufällig aussehende Artikelnummer (AH-XXX-XXXX), fest je Produkt (aus dem Slug abgeleitet).
function artNr(slug) {
  const s = String(slug || '');
  let a = 2166136261 >>> 0, b = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (a ^ c) >>> 0;
    a = (a + ((a << 1) + (a << 4) + (a << 7) + (a << 8) + (a << 24))) >>> 0;
    b = (((b << 5) + b) + c) >>> 0;
  }
  return 'AH-' + (100 + (a % 900)) + '-' + (1000 + (b % 9000));
}
module.exports = { euro, num, dateDE, dateTimeDE, timeDE, dateTimeSecDE, timeSecDE, pageLabel, prettySlug, totals, orderNumber, invoiceNumber, safeParse, relTime, orderShipping, groupLabel, groupLabelSingular, artNr };
