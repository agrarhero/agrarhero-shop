// ============================================================
//  Gäste-Protokoll: nicht angemeldete Besucher (ohne Bots)
//  - Persistiert je Sitzung (sid) in guest_visits
//  - Bots (kein/erkannter User-Agent) werden NICHT protokolliert
//  - Automatische Löschung nach 3 Tagen
// ============================================================
const db = require('../db');
const presence = require('./presence');
const geo = require('./geo');

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 Tage
const MAX_PAGES = 80;
// Assets/JSON/Heartbeats/Adminbereich nicht als "aufgerufene Seite" werten
const IGNORE_RE = /^\/(aktiv|admin|favicon|robots|sitemap|css|js|img|images|fonts|assets|static|heartbeat|puls|api|\.well-known)/i;
// Gefälschte/veraltete/technische User-Agents (keine echten Kunden-Geräte)
const FAKE_UA = /windows phone|iemobile|lumia|(^|; )msie |trident\/|windows ce|symbianos|series60|blackberry|bb10|playbook|j2me|midp|palmos|android [1-4]\.[0-9]|headless|phantomjs|slimerjs|selenium|puppeteer|playwright|python-requests|python-urllib|curl\/|wget\/|libwww|go-http-client|okhttp|java\/[0-9]|apache-httpclient|axios\/|node-fetch|guzzlehttp|scrapy|winhttp|httpclient|dataprovider|facebookexternalhit|whatsapp|telegrambot|bytespider|petalbot|semrush|ahrefsbot|mj12bot|dotbot|dataforseo/i;
function looksFake(ua){ ua = ua || ''; return !ua || FAKE_UA.test(ua); }

const selStmt = db.prepare('SELECT first_seen, page_count, pages FROM guest_visits WHERE sid = ?');
const upStmt = db.prepare(`
INSERT INTO guest_visits (sid, first_seen, last_seen, ip, ua, ref, page_count, pages, cart)
VALUES (?,?,?,?,?,?,?,?,?)
ON CONFLICT(sid) DO UPDATE SET
  last_seen  = excluded.last_seen,
  ip         = excluded.ip,
  ua         = excluded.ua,
  ref        = CASE WHEN (guest_visits.ref IS NULL OR guest_visits.ref='') THEN excluded.ref ELSE guest_visits.ref END,
  page_count = excluded.page_count,
  pages      = excluded.pages,
  cart       = excluded.cart`);

// Bei jedem Gäste-Request aufrufen (Aufrufer stellt sicher: nicht eingeloggt).
function record(req) {
  try {
    const ua = req.headers['user-agent'] || '';
    if (!ua || presence.isBot(ua) || looksFake(ua)) return;   // Bots + gefälschte/technische UAs ignorieren
    const sid = req.sessionId; if (!sid) return;
    const now = Date.now();
    const ip = geo.clientIp(req) || '';
    const ref = (req.session && req.session.landingRef) || '';
    const cart = JSON.stringify((req.session && req.session.cart) || {});
    // Exakte URL inkl. Query-String merken (originalUrl), damit z. B.
    // "/produkte?gruppe=seilwinde" von "/" und "/produkte" unterscheidbar ist.
    const rawUrl = req.originalUrl || req.url || req.path || '/';
    const path = (rawUrl.split('?')[0].split('#')[0]) || '/';

    const row = selStmt.get(sid);
    let pages = [], first = now, pc = 0;
    if (row) {
      first = row.first_seen; pc = row.page_count || 0;
      try { pages = JSON.parse(row.pages || '[]'); } catch (e) { pages = []; }
    }
    const isPage = (req.method === 'GET') && !IGNORE_RE.test(path);
    const lastUrl = pages.length ? (pages[pages.length - 1].u || pages[pages.length - 1].p) : null;
    if (isPage && lastUrl !== rawUrl) {
      pages.push({ u: rawUrl, t: now });
      if (pages.length > MAX_PAGES) pages = pages.slice(-MAX_PAGES);
      pc += 1;
    }
    upStmt.run(sid, first, now, ip, ua, ref, pc, JSON.stringify(pages), cart);
  } catch (e) { /* Tracking darf den Request niemals stören */ }
}

// Alle Gäste der letzten `ms` (Standard: 3 Tage), neueste zuerst.
function list(ms) {
  const since = Date.now() - (ms || RETENTION_MS);
  return db.prepare('SELECT * FROM guest_visits WHERE last_seen >= ? ORDER BY last_seen DESC').all(since);
}

function saveGeo(sid, ip, g) {
  db.prepare('UPDATE guest_visits SET geo_ip=?, geo_country=?, geo_cc=?, geo_region=?, geo_city=? WHERE sid=?')
    .run(ip, (g && g.country) || '', (g && g.countryCode) || '', (g && g.region) || '', (g && g.city) || '', sid);
}

function markSuspect(sid){ try { db.prepare('UPDATE guest_visits SET suspect=1 WHERE sid=?').run(sid); } catch (e) {} }

// Beim Registrieren aufrufen: markiert im Besuchsverlauf den Moment, in dem
// aus einem Gast ein Kunde wurde (Zeitpunkt + verknüpfte user_id).
function markRegistered(sid, userId){
  try { db.prepare('UPDATE guest_visits SET registered_at=?, user_id=? WHERE sid=?').run(Date.now(), Number(userId) || null, sid); } catch (e) {}
}

function prune() {
  try { db.prepare('DELETE FROM guest_visits WHERE last_seen < ?').run(Date.now() - RETENTION_MS); } catch (e) {}
  // Bestehende gefälschte/technische UAs nachträglich entfernen
  try { for (const r of db.prepare('SELECT sid, ua FROM guest_visits').all()) if (looksFake(r.ua)) db.prepare('DELETE FROM guest_visits WHERE sid=?').run(r.sid); } catch (e) {}
}
prune();
const timer = setInterval(prune, 60 * 60 * 1000); // stündlich aufräumen
if (timer.unref) timer.unref();

// Leichter User-Agent-Parser (ohne Abhängigkeiten)
function parseUa(ua) {
  ua = ua || '';
  let os = 'Unbekannt', browser = 'Unbekannt', device = 'Desktop', mobile = false;
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  if (/iPad|Tablet/.test(ua)) { device = 'Tablet'; mobile = true; }
  else if (/Mobile|iPhone|Android.*Mobile/.test(ua)) { device = 'Smartphone'; mobile = true; }
  return { os, browser, device, mobile };
}

module.exports = { record, list, saveGeo, prune, parseUa, looksFake, markSuspect, markRegistered, RETENTION_MS };
