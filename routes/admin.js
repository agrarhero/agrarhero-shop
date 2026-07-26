// ============================================================
//  Admin-Dashboard: Bestellungen prüfen, Rechnung & Status-Workflow
// ============================================================
const { Router } = require('../lib/app');
const router = Router();
const fs = require('fs');
const db = require('../db');
const h = require('../lib/helpers');
const { sendMail } = require('../lib/mailer');
const { generateInvoice } = require('../lib/invoice');
const emails = require('../lib/emails');
const geo = require('../lib/geo');
const status = require('../lib/status');
const cartlib = require('../lib/cart');
const settingsLib = require('../lib/settings');
const presence = require('../lib/presence');
const guestlog = require('../lib/guestlog');
const ids = require('../lib/ids');
const inventory = require('../lib/inventory');

// Live-Praesenz fuer die Kundenliste: welche registrierten Kunden sind online,
// wie viele anonyme Gaeste stoebern gerade. Admins zaehlen bei beidem nicht mit.
function liveStats() {
  const snap = presence.snapshot();
  const online = [...snap.onlineUserIds];
  let onlineIds = [];
  if (online.length) {
    const rows = db.prepare(
      `SELECT id FROM users WHERE is_admin = 0 AND id IN (${online.map(() => '?').join(',')})`
    ).all(...online);
    onlineIds = rows.map(r => r.id);
  }
  return { onlineIds, onlineCount: onlineIds.length, guests: snap.guests };
}

function requireAdmin(req, res, next) {
  if (!req.user) { req.session.returnTo = req.originalUrl; req.flash('info', 'Bitte als Administrator anmelden.'); return res.redirect('/login'); }
  if (!req.user.is_admin) return res.status(403).render('error', { title: 'Kein Zugriff', code: 403, message: 'Dieser Bereich ist Administratoren vorbehalten.' });
  next();
}

function loadOrder(id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  order.totals = h.totals(order.items, order.tax_rate, order.shipping_cents);
  order.user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id);
  return order;
}

function dataChecks(order) {
  const c = [];
  const req = (label, val) => c.push({ label, ok: Boolean(val && String(val).trim()), value: val || '—' });
  req('Vorname', order.cust_first_name); req('Nachname', order.cust_last_name); req('E-Mail', order.cust_email);
  req('Straße & Nr.', order.cust_street); req('PLZ', order.cust_zip); req('Ort', order.cust_city); req('Telefon', order.cust_phone);
  c.push({ label: 'E-Mail-Format', ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(order.cust_email || ''), value: order.cust_email || '—' });
  c.push({ label: 'PLZ-Format (5-stellig)', ok: /^\d{5}$/.test(order.cust_zip || ''), value: order.cust_zip || '—' });
  return c;
}

// Geo für eine Bestellung sicherstellen (Land/Bundesland aus IP), Ergebnis speichern
async function ensureGeo(order) {
  if (!order || !order.ip || order.geo_country_code || geo.isPrivate(order.ip)) return order;
  const g = await geo.lookup(order.ip);
  if (g) {
    db.prepare('UPDATE orders SET geo_country=?, geo_country_code=?, geo_region=? WHERE id=?')
      .run(g.country || '', g.countryCode || '', g.region || '', order.id);
    order.geo_country = g.country; order.geo_country_code = g.countryCode; order.geo_region = g.region;
  }
  return order;
}

// Geo für einen Kunden (aus last_ip)
async function ensureUserGeo(user) {
  const ip = user.last_ip;
  if (!ip || geo.isPrivate(ip)) return user;
  if (user.geo_country_code && user.geo_ip === ip) return user;
  const g = await geo.lookup(ip);
  if (g) {
    db.prepare('UPDATE users SET geo_country=?, geo_country_code=?, geo_region=?, geo_ip=? WHERE id=?')
      .run(g.country || '', g.countryCode || '', g.region || '', ip, user.id);
    Object.assign(user, { geo_country: g.country, geo_country_code: g.countryCode, geo_region: g.region, geo_ip: ip });
  }
  return user;
}
// Aktueller Warenkorb eines Kunden (für Live-Ansicht)
function loadCustomerCart(userId) {
  const cart = cartlib.loadUserCart(userId);
  const keys = Object.keys(cart);
  const items = [];
  for (const k of keys) {
    const line = cart[k]; if (!line || typeof line !== 'object') continue;
    const p = db.prepare('SELECT name, type, price_cents, slug FROM products WHERE id = ?').get(line.product_id);
    if (!p) continue;
    items.push({ name: p.name + (line.color ? ' – Farbe: ' + line.color : ''), type: p.type, slug: p.slug, unit_cents: p.price_cents, quantity: Number(line.quantity) || 0 });
  }
  return { items, totals: h.totals(items), updated: cartlib.updatedAt(userId) };
}

// ---------- Dashboard ----------
router.get('/', requireAdmin, async (req, res) => {
  const filter = req.query.status || '';
  const rows = filter
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC').all(filter)
    : db.prepare('SELECT * FROM orders ORDER BY id DESC').all();

  // Geo für sichtbare Bestellungen nachladen (nur öffentliche IPs, begrenzt)
  const toResolve = rows.filter(o => o.ip && !o.geo_country_code && !geo.isPrivate(o.ip)).slice(0, 12);
  await Promise.all(toResolve.map(o => ensureGeo(o)));

  const riskLib = require('../lib/risk');
  const watch = settingsLib.raw().fraud_watch_domains;
  const userCache = {};
  const orders = rows.map(o => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    let sec = null;
    if (o.user_id) {
      let u = userCache[o.user_id];
      if (u === undefined) { u = db.prepare('SELECT * FROM users WHERE id = ?').get(o.user_id) || null; userCache[o.user_id] = u; }
      if (u) {
        const ordCount = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(u.id).n;
        const r = riskLib.assess(u, new Array(ordCount), db, watch);
        sec = { uid: u.id, score: r.score, max: r.scoreMax, level: r.level, origin: riskLib.originInfo(u.landing_ref) };
      }
    }
    return { ...o, totals: h.totals(items, o.tax_rate, o.shipping_cents), itemCount: items.reduce((s, i) => s + i.quantity, 0), flag: geo.flag(o.geo_country_code), sec };
  });

  const counts = { total: db.prepare('SELECT COUNT(*) AS n FROM orders').get().n };
  for (const key of Object.keys(status.STATUS)) {
    counts[key] = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE status = ?').get(key).n;
  }
  res.render('admin/dashboard', { title: 'Admin – Bestellungen', orders, counts, filter, kpis: status.KPIS, stat: status });
});

// ---------- Bestelldetail ----------
router.get('/bestellung/:id', requireAdmin, async (req, res) => {
  const order = loadOrder(req.params.id);
  if (!order) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Bestellung nicht gefunden.' });
  // Beim ersten Öffnen: neu -> geöffnet
  if (order.status === 'neu') {
    db.prepare("UPDATE orders SET status='geoeffnet', opened_at=datetime('now') WHERE id=?").run(order.id);
    order.status = 'geoeffnet';
  }
  await ensureGeo(order);
  if (!order.invoice_number) { order.invoice_number = ids.uniqueInvoiceNumber(); db.prepare('UPDATE orders SET invoice_number = ? WHERE id = ?').run(order.invoice_number, order.id); }
  if (!order.invoice_date) order.invoice_date = new Date().toISOString().slice(0, 10);
  const defTax = settingsLib.raw().seller_taxnumber || '';
  if (!order.seller_taxnumber && defTax) order.seller_taxnumber = defTax;
  res.render('admin/order', { title: 'Bestellung ' + order.order_number, order, checks: dataChecks(order), stat: status, geo, taxRemembered: !!defTax });
});

// ---------- Rechnungsdaten speichern ----------
router.post('/bestellung/:id/speichern', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin');
  const b = req.body;
  db.prepare(`UPDATE orders SET seller_name=?, seller_address=?, seller_email=?, seller_phone=?, seller_iban=?, seller_bic=?, seller_bank=?, seller_ustid=?, seller_taxnumber=?, seller_account_holder=?, invoice_number=?, invoice_date=?, payment_days=?, delivery_days=?, invoice_note=?, admin_note=?, tax_rate=? WHERE id=?`)
    .run(b.seller_name||'', b.seller_address||'', b.seller_email||'', b.seller_phone||'', b.seller_iban||'', b.seller_bic||'', b.seller_bank||'', b.seller_ustid||'', b.seller_taxnumber||'', b.seller_account_holder||'', b.invoice_number||'', b.invoice_date||'', b.payment_days||'', b.delivery_days||'', b.invoice_note||'', b.admin_note||'', Number(b.tax_rate || 19), order.id);
  if (b.seller_taxnumber_remember === 'ja') settingsLib.set('seller_taxnumber', (b.seller_taxnumber || '').trim()); else settingsLib.set('seller_taxnumber', '');
  req.flash('success', 'Daten gespeichert.');
  res.redirect('/admin/bestellung/' + order.id);
});

// ---------- Rechnung erzeugen & senden ----------
router.post('/bestellung/:id/rechnung', requireAdmin, async (req, res) => {
  const b = req.body;
  db.prepare(`UPDATE orders SET seller_name=?, seller_address=?, seller_email=?, seller_phone=?, seller_iban=?, seller_bic=?, seller_bank=?, seller_ustid=?, seller_taxnumber=?, seller_account_holder=?, invoice_number=?, invoice_date=?, payment_days=?, delivery_days=?, invoice_note=?, admin_note=?, tax_rate=? WHERE id=?`)
    .run(b.seller_name||'', b.seller_address||'', b.seller_email||'', b.seller_phone||'', b.seller_iban||'', b.seller_bic||'', b.seller_bank||'', b.seller_ustid||'', b.seller_taxnumber||'', b.seller_account_holder||'', b.invoice_number||'', b.invoice_date||'', b.payment_days||'', b.delivery_days||'', b.invoice_note||'', b.admin_note||'', Number(b.tax_rate || 19), req.params.id);
  if (b.seller_taxnumber_remember === 'ja') settingsLib.set('seller_taxnumber', (b.seller_taxnumber || '').trim()); else settingsLib.set('seller_taxnumber', '');
  const order = loadOrder(req.params.id);
  if (!order) return res.redirect('/admin');
  try {
    const pdfPath = await generateInvoice(order, order.items);
    const mail = emails.invoiceMail(order, order.items);
    await sendMail({ to: order.cust_email, subject: mail.subject, html: mail.html, text: mail.text, attachments: [{ filename: `Rechnung_${(order.invoice_number || order.order_number)}.pdf`, path: pdfPath }] });
    db.prepare("UPDATE orders SET status='berechnet', invoice_sent_at=datetime('now') WHERE id=?").run(order.id);
    req.flash('success', `Rechnung ${order.invoice_number} wurde an ${order.cust_email} gesendet.`);
  } catch (err) { console.error('Rechnungsversand-Fehler:', err); req.flash('error', 'Fehler beim Erstellen/Senden der Rechnung: ' + err.message); }
  res.redirect('/admin/bestellung/' + order.id);
});

// ---------- Rechnung als PDF ----------
router.get('/bestellung/:id/rechnung.pdf', requireAdmin, async (req, res) => {
  const order = loadOrder(req.params.id);
  if (!order) return res.status(404).send('Nicht gefunden');
  if (!order.invoice_number) { order.invoice_number = ids.uniqueInvoiceNumber(); db.prepare('UPDATE orders SET invoice_number = ? WHERE id = ?').run(order.invoice_number, order.id); }
  const pdfPath = await generateInvoice(order, order.items);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Rechnung_${order.invoice_number}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

// ---------- Ignorieren / Aufheben ----------
router.post('/bestellung/:id/ignorieren', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin');
  db.prepare("UPDATE orders SET status_before_ignore=?, status='ignoriert' WHERE id=?").run(order.status, order.id);
  req.flash('success', 'Bestellung wurde als „ignoriert" markiert.');
  res.redirect('/admin/bestellung/' + order.id);
});
router.post('/bestellung/:id/ignorieren-aufheben', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin');
  const back = order.status_before_ignore || 'geoeffnet';
  db.prepare("UPDATE orders SET status=?, status_before_ignore=NULL WHERE id=?").run(back, order.id);
  req.flash('success', 'Markierung „ignoriert" wurde aufgehoben.');
  res.redirect('/admin/bestellung/' + order.id);
});

// ---------- Statuswechsel mit Kunden-Mail ----------
function advance(statusName, mailFn, successMsg) {
  return async (req, res) => {
    const order = loadOrder(req.params.id);
    if (!order) return res.redirect('/admin');
    db.prepare('UPDATE orders SET status=? WHERE id=?').run(statusName, order.id);
    if (statusName === 'bezahlt') db.prepare("UPDATE orders SET paid_at=datetime('now') WHERE id=?").run(order.id);
    if (mailFn) {
      try {
        const mail = mailFn(order);
        await sendMail({ to: order.cust_email, subject: mail.subject, html: mail.html, text: mail.text });
      } catch (err) { console.error('Status-Mail-Fehler:', err); req.flash('error', 'Statuswechsel ok, aber Mail-Fehler: ' + err.message); }
    }
    if (!req.session.flash) req.flash('success', successMsg);
    res.redirect('/admin/bestellung/' + order.id);
  };
}
router.post('/bestellung/:id/bezahlt', requireAdmin, advance('bezahlt', null, 'Bestellung als „bezahlt" markiert.'));
router.post('/bestellung/:id/versand', requireAdmin, advance('versand', (o) => emails.shipmentPreparing(o), 'Status „Versand" gesetzt – Zahlungseingang-Mail gesendet.'));
router.post('/bestellung/:id/versand-verspaetung', requireAdmin, advance('versand_verspaetung', (o) => emails.shipmentDelay(o), 'Status „Versand Verspätung" gesetzt – Info-Mail gesendet.'));
router.post('/bestellung/:id/versendet', requireAdmin, advance('versendet', (o) => emails.shipmentSent(o), 'Status „Versendet" gesetzt – Versandbestätigung gesendet.'));
router.post('/bestellung/:id/zugestellt', requireAdmin, advance('zugestellt', null, 'Status Zugestellt gesetzt – nur für den Kunden sichtbar, keine E-Mail.'));

// ---------- Löschen und Bannen ----------
router.post('/bestellung/:id/loeschen-bannen', requireAdmin, (req, res) => {
  if (req.body.confirm !== 'ja') { req.flash('error', 'Löschen abgebrochen (nicht bestätigt).'); return res.redirect('/admin/bestellung/' + req.params.id); }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.redirect('/admin');
  const email = banUser(order.user_id);
  req.flash('success', `Bestellung(en) gelöscht und E-Mail ${email || ''} gesperrt.`);
  res.redirect('/admin');
});


// ---------- Gemeinsame Bann-Funktion ----------
function banUser(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user || user.is_admin) return null;
  db.transaction(() => {
    const orders = db.prepare('SELECT id FROM orders WHERE user_id = ?').all(userId);
    for (const o of orders) {
      // Bestand der Bestellung zurückbuchen, bevor die Positionen gelöscht werden.
      try { inventory.restockOrder(o.id); } catch (e) { console.error('Bestand zurückbuchen:', e.message); }
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(o.id);
      db.prepare('DELETE FROM orders WHERE id = ?').run(o.id);
    }
    db.prepare('INSERT OR IGNORE INTO banned_emails (email) VALUES (?)').run(user.email);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  })();
  return user.email;
}

// ---------- Kundenliste ----------
router.get('/kunden', requireAdmin, async (req, res) => {
  const users = db.prepare("SELECT * FROM users WHERE is_admin = 0 ORDER BY id DESC").all();
  const toResolve = users.filter(u => u.last_ip && !geo.isPrivate(u.last_ip) && (!u.geo_country_code || u.geo_ip !== u.last_ip)).slice(0, 12);
  await Promise.all(toResolve.map(u => ensureUserGeo(u)));
  const live = liveStats();
  const onlineSet = new Set(live.onlineIds);
  const risk = require('../lib/risk');
  const watch = settingsLib.raw().fraud_watch_domains;
  const list = users.map(u => {
    const orderCount = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(u.id).n;
    const r = risk.assess(u, new Array(orderCount), db, watch);
    return {
      ...u,
      orderCount,
      cartCount: Object.values(cartlib.loadUserCart(u.id)).reduce((s, l) => s + (Number(l && l.quantity) || 0), 0),
      flag: geo.flag(u.geo_country_code),
      online: onlineSet.has(u.id),
      riskLevel: r.level,
      riskBad: r.bad,
      score: r.score,
      scoreMax: r.scoreMax,
      origin: risk.originInfo(u.landing_ref),
    };
  });
  res.render('admin/customers', { title: 'Admin – Kunden', users: list, geo, onlineCount: live.onlineCount, guests: live.guests });
});

// ---------- Live-Praesenz als JSON (fuer die Auto-Aktualisierung der Kundenliste) ----------
// Muss VOR '/kunden/:id' stehen, sonst wuerde ':id' = "live" greifen.
router.get('/kunden/live', requireAdmin, (req, res) => {
  const live = liveStats();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify({ onlineCount: live.onlineCount, guests: live.guests, online: live.onlineIds }));
});

// ---------- Gäste-Liste (nicht angemeldete Besucher, ohne Bots, Verlauf 3 Tage) ----------
router.get('/gaeste', requireAdmin, async (req, res) => {
  const rows = guestlog.list();
  const toResolve = rows.filter(g => g.ip && !geo.isPrivate(g.ip) && g.geo_ip !== g.ip).slice(0, 15);
  await Promise.all(toResolve.map(async (g) => {
    const info = await geo.lookup(g.ip);
    if (info) {
      guestlog.saveGeo(g.sid, g.ip, info);
      const dc = /amazon|\baws\b|google cloud|google llc|microsoft|azure|\bovh\b|hetzner|digitalocean|digital ocean|linode|contabo|leaseweb|oracle|alibaba|tencent|vultr|choopa|\bm247\b|scaleway|datacamp|constant company|quadranet|hostinger|colocation/i;
      const susp = info.hosting || dc.test((info.org||'') + ' ' + (info.isp||''));
      if (susp) { guestlog.markSuspect(g.sid); g.suspect = 1; }
      Object.assign(g, { geo_ip: g.ip, geo_country: info.country, geo_cc: info.countryCode, geo_region: info.region, geo_city: info.city });
    }
  }));
  const now = Date.now();

  // Produkt-Namen für schöne Seiten-Labels (statt nur des Slugs).
  const prodBySlug = {};
  try { db.prepare('SELECT slug,name FROM products').all().forEach(p => { prodBySlug[p.slug] = p.name; }); } catch (e) {}
  const labelFor = (url) => {
    const path = (String(url || '/').split('?')[0]).replace(/\/+$/, '') || '/';
    if (path.startsWith('/produkt/')) { const slug = path.slice('/produkt/'.length); return 'Produkt · ' + (prodBySlug[slug] || h.prettySlug(slug)); }
    return h.pageLabel(url);
  };

  // 1) Rohsitzungen aufbereiten
  const sessions = rows.map((g) => {
    let pages = []; try { pages = JSON.parse(g.pages || '[]'); } catch (e) {}
    pages = pages.filter(x => x && (x.u || x.p) && !/^\/aktiv\b/.test(x.u || x.p));
    let cartObj = {}; try { cartObj = JSON.parse(g.cart || '{}'); } catch (e) {}
    const cartItems = [];
    for (const k of Object.keys(cartObj)) {
      const line = cartObj[k]; if (!line || typeof line !== 'object') continue;
      const p = db.prepare('SELECT name, price_cents FROM products WHERE id = ?').get(line.product_id);
      if (!p) continue;
      cartItems.push({ name: p.name + (line.color ? ' – ' + line.color : ''), qty: Number(line.quantity) || 0, unit_cents: p.price_cents });
    }
    const cartNet = cartItems.reduce((s, i) => s + i.unit_cents * i.qty, 0);
    return {
      sid: g.sid, suspect: g.suspect ? 1 : 0,
      online: (now - g.last_seen) <= presence.GUEST_WINDOW_MS,
      first: g.first_seen, last: g.last_seen,
      ip: g.ip || '', ua: g.ua || '', dev: guestlog.parseUa(g.ua),
      flag: geo.flag(g.geo_cc), country: g.geo_country || '', region: g.geo_region || '', city: g.geo_city || '',
      ref: g.ref || '', pages,
      registered_at: g.registered_at || null, user_id: g.user_id || null,
      cartItems, cartCount: cartItems.reduce((s, i) => s + i.qty, 0), cartGross: Math.round(cartNet * 1.19),
    };
  });

  const withPages = sessions.filter(s => s.pages.length > 0);
  const real = withPages.filter(s => !s.suspect && !guestlog.looksFake(s.ua));
  const showAll = req.query.alle === '1';
  const shown = showAll ? withPages : real;

  // 2) Nach IP gruppieren: eine IP = immer genau EIN Besucher, egal wie viele
  //    Sitzungen/Signale (z. B. eines iPhones) mit derselben IP hereinkommen.
  //    IP-Schreibweisen werden normalisiert (IPv6-Präfix, Groß/Klein, Leerzeichen),
  //    damit dieselbe IP nicht durch Formatunterschiede getrennt angezeigt wird.
  const normIp = (ip) => String(ip || '').trim().toLowerCase().replace(/^::ffff:/, '');
  const groups = new Map();
  for (const s of shown) {
    const nip = normIp(s.ip);
    const key = nip ? ('ip:' + nip) : ('sid:' + s.sid);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const VISIT_GAP = 30 * 60 * 1000; // >30 Min. Pause = neuer Besuch
  const ORD = ['Erstbesuch','Zweitbesuch','Drittbesuch','Viertbesuch','Fünftbesuch','Sechstbesuch','Siebtbesuch','Achtbesuch','Neuntbesuch','Zehntbesuch'];
  const ordinal = (n) => ORD[n - 1] || (n + '. Besuch');
  const dayLabel = (ms) => new Date(ms).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

  const visitors = [];
  for (const [key, ss] of groups) {
    ss.sort((a, b) => b.last - a.last);
    const recent = ss[0];
    // Alle Seitenaufrufe flach + chronologisch
    const views = [];
    for (const s of ss) for (const pg of s.pages) { const url = pg.u || pg.p; views.push({ t: pg.t, url, label: labelFor(url) }); }
    views.sort((a, b) => a.t - b.t);
    // In Besuche segmentieren
    const visits = [];
    let cur = null;
    for (const v of views) {
      if (!cur || (v.t - cur.end) > VISIT_GAP) { cur = { start: v.t, end: v.t, pages: [] }; visits.push(cur); }
      cur.pages.push(v); cur.end = v.t;
    }
    visits.forEach((vi, i) => { vi.n = i + 1; vi.name = ordinal(i + 1); vi.day = dayLabel(vi.start); vi.durationSec = Math.round((vi.end - vi.start) / 1000); });
    // Registrierung ("jetzt Kunde")
    const regSess = ss.find(s => s.registered_at);
    const registeredAt = regSess ? regSess.registered_at : null;
    const userId = regSess ? regSess.user_id : null;
    let userInfo = null;
    if (userId) { try { const u = db.prepare('SELECT id, email, first_name, last_name, customer_number FROM users WHERE id=?').get(userId); if (u) userInfo = u; } catch (e) {} }
    if (registeredAt) {
      let target = null;
      for (const vi of visits) if (vi.start <= registeredAt) target = vi;
      if (!target && visits.length) target = visits[visits.length - 1];
      if (target) target.registerEvent = registeredAt;
    }
    // Live aktuelle Seite (aktivste Online-Sitzung)
    let live = null;
    for (const s of ss) if (s.online) { const c = presence.sidCurrent(s.sid); if (c && c.path) { if (!live || c.at > live.at) live = { label: labelFor(c.path), url: c.path, since: c.since, at: c.at }; } }
    const cartSess = ss.find(s => s.cartItems.length) || recent;
    visitors.push({
      ip: normIp(recent.ip) || recent.ip, flag: recent.flag, country: recent.country, region: recent.region, city: recent.city,
      dev: recent.dev, ua: recent.ua,
      online: ss.some(s => s.online),
      first: Math.min.apply(null, ss.map(s => s.first)), last: Math.max.apply(null, ss.map(s => s.last)),
      ref: ss.map(s => s.ref).find(Boolean) || '',
      suspect: ss.some(s => s.suspect) ? 1 : 0,
      sessionCount: ss.length, totalPages: views.length, visitCount: visits.length,
      visits: visits.reverse(), // neueste zuerst
      registeredAt, userInfo, live,
      cartItems: cartSess.cartItems, cartCount: cartSess.cartCount, cartGross: cartSess.cartGross,
    });
  }
  visitors.sort((a, b) => b.last - a.last);

  res.render('admin/guests', {
    title: 'Admin – Gäste', visitors, h, geo,
    onlineNow: visitors.filter(v => v.online).length,
    showAll, hidden: withPages.length - real.length,
  });
});

// ---------- Kundenprofil ----------
router.get('/kunden/:id', requireAdmin, async (req, res) => {
  const cust = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (!cust) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Kunde nicht gefunden.' });
  await ensureUserGeo(cust);
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(cust.id).map(o => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
    return { ...o, totals: h.totals(items, o.tax_rate, o.shipping_cents), itemCount: items.reduce((s, i) => s + i.quantity, 0) };
  });
  const cartInfo = loadCustomerCart(cust.id);
  const riskLib0 = require('../lib/risk');
  const risk = riskLib0.assess(cust, orders, db, settingsLib.raw().fraud_watch_domains);
  const origin = riskLib0.originInfo(cust.landing_ref);
  // Live: auf welcher Seite ist dieser Kunde gerade?
  let live = null;
  const lc = presence.userCurrent(cust.id);
  if (lc && lc.path) {
    const path = (lc.path.split('?')[0]).replace(/\/+$/, '') || '/';
    let label = h.pageLabel(lc.path);
    if (path.startsWith('/produkt/')) { const slug = path.slice('/produkt/'.length); const p = db.prepare('SELECT name FROM products WHERE slug=?').get(slug); if (p) label = 'Produkt · ' + p.name; }
    live = { label, url: lc.path, since: lc.since };
  }
  res.render('admin/customer', { title: 'Kunde ' + cust.email, cust, orders, stat: status, geo, cartInfo, risk, origin, live });
});

// ---------- Kauf auf Rechnung pro Kunde freigeben/sperren ----------
router.post('/kunden/:id/rechnung', requireAdmin, (req, res) => {
  const allow = req.body.allow === '1' ? 1 : 0;
  db.prepare('UPDATE users SET invoice_allowed = ? WHERE id = ? AND is_admin = 0').run(allow, req.params.id);
  req.flash('success', allow ? 'Kauf auf Rechnung für diesen Kunden freigeschaltet.' : 'Kauf auf Rechnung gesperrt – dieser Kunde zahlt nur per Vorkasse.');
  res.redirect('/admin/kunden/' + req.params.id);
});

// ---------- Mindestbestellmenge pro Kunde aufheben/aktivieren ----------
router.post('/kunden/:id/mindestmenge', requireAdmin, (req, res) => {
  const waive = req.body.waive === '1' ? 1 : 0;
  db.prepare('UPDATE users SET min_order_waived = ? WHERE id = ? AND is_admin = 0').run(waive, req.params.id);
  req.flash('success', waive ? 'Mindestbestellmenge für diesen Kunden aufgehoben – er kann beliebige Stückzahlen bestellen.' : 'Mindestbestellmenge wieder aktiviert (Standard gilt).');
  res.redirect('/admin/kunden/' + req.params.id);
});

// ---------- Willkommens-/Danke-Mail an registrierten Kunden senden ----------
router.post('/kunden/:id/willkommen', requireAdmin, async (req, res) => {
  const cust = db.prepare('SELECT * FROM users WHERE id = ? AND is_admin = 0').get(req.params.id);
  if (!cust) { req.flash('error', 'Kunde nicht gefunden.'); return res.redirect('/admin/kunden'); }
  const orderCount = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE user_id = ?').get(cust.id).n;
  if (orderCount > 0 && req.body.force !== '1') {
    req.flash('error', 'Dieser Kunde hat bereits bestellt – Willkommens-Mail nicht gesendet.');
    return res.redirect('/admin/kunden/' + cust.id);
  }
  const baseUrl = (process.env.BASE_URL || 'https://agrarhero.de').replace(/\/+$/, '');
  const shopEmail = process.env.MAIL_REPLY_TO || 'info@agrarhero.de';
  const mail = emails.welcomeMail(cust, { baseUrl, shopEmail });
  try {
    await sendMail({ to: cust.email, subject: mail.subject, html: mail.html, text: mail.text, replyTo: shopEmail });
    db.prepare("UPDATE users SET welcome_sent_at = datetime('now') WHERE id = ?").run(cust.id);
    req.flash('success', `Willkommens-Mail an ${cust.email} gesendet.`);
  } catch (err) {
    console.error('Mailfehler (Willkommen):', err.message);
    req.flash('error', 'Willkommens-Mail konnte nicht gesendet werden: ' + err.message);
  }
  res.redirect('/admin/kunden/' + cust.id);
});

// ---------- Kunde löschen & bannen (aus dem Profil) ----------
router.post('/kunden/:id/loeschen-bannen', requireAdmin, (req, res) => {
  if (req.body.confirm !== 'ja') { req.flash('error', 'Löschen abgebrochen (nicht bestätigt).'); return res.redirect('/admin/kunden/' + req.params.id); }
  const email = banUser(req.params.id);
  req.flash('success', email ? `Kunde gelöscht und E-Mail ${email} gesperrt.` : 'Konto nicht gefunden.');
  res.redirect('/admin/kunden');
});

// ---------- Produkte: Verwaltung (Liste, Bearbeiten, Anlegen, Löschen) ----------
const path = require('path');
const PRODUCTS_DIR = path.join(__dirname, '..', 'public', 'img', 'products');
const GROUPS = ['guellefass', 'seilwinde', 'saege', 'erntebox'];

function slugify(str) {
  return String(str || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || ('produkt-' + Date.now());
}
function uniqueSlug(base, exceptId) {
  let slug = base, i = 2;
  while (true) {
    const row = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
    if (!row || row.id === exceptId) return slug;
    slug = base + '-' + (i++);
  }
}
function euroToCents(str) {
  if (str == null) return null;
  let s = String(str).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.indexOf(',') > -1) s = s.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s);
  return isFinite(v) ? Math.round(v * 100) : null;
}
function extFor(ct, filename) {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };
  if (map[ct]) return map[ct];
  const e = String(filename || '').split('.').pop().toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(e)) return e === 'jpeg' ? 'jpg' : e;
  return null;
}
function saveProductImage(file, slug) {
  if (!file || !file.data || !file.data.length) return null;
  if (file.data.length > 15 * 1024 * 1024) return null;
  const ext = extFor(file.contentType, file.filename);
  if (!ext) return null;
  try { if (!fs.existsSync(PRODUCTS_DIR)) fs.mkdirSync(PRODUCTS_DIR, { recursive: true }); } catch (e) {}
  const name = slug + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + ext;
  fs.writeFileSync(path.join(PRODUCTS_DIR, name), file.data);
  return name;
}
function asArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }
function safeArr(str) { try { const a = JSON.parse(str || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function saveGalleryFiles(files, slug) {
  const out = [];
  for (const f of asArray(files)) { const n = saveProductImage(f, slug); if (n) out.push(n); }
  return out;
}

function readProductForm(b) {
  const featureList = String(b.features || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let grp = GROUPS.includes(b.product_group) ? b.product_group : 'guellefass';
  const colorList = String(b.color_options || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return {
    color_options: JSON.stringify(colorList),
    name: (b.name || '').trim(),
    type: (b.type || '').trim(),
    product_group: grp,
    category: (b.category || '').trim() || 'sondermasse',
    short_desc: (b.short_desc || '').trim(),
    description: (b.description || '').trim(),
    features: JSON.stringify(featureList),
    price_cents: euroToCents(b.price) || 0,
    compare_cents: euroToCents(b.compare),
    dimensions: (b.dimensions || '').trim(),
    load_capacity: (b.load_capacity || '').trim(),
    bestseller: (b.bestseller ? 1 : 0),
    sold_out: (b.sold_out ? 1 : 0),
    active: (b.active ? 1 : 0),
    min_order: Math.max(1, Math.min(100000, parseInt(b.min_order, 10) || 1)),
    max_order: Math.max(1, Math.min(100000, parseInt(b.max_order, 10) || 200)),
    sort_order: parseInt(b.sort_order, 10) || 0,
  };
}

router.get('/produkte', requireAdmin, (req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY product_group, sort_order, id").all();
  res.render('admin/products', { title: 'Admin – Produkte', products, saved: req.query.ok === '1' });
});

// Schnellspeichern der Mindest-/Maximalmengen aus der Liste
router.post('/produkte/speichern', requireAdmin, (req, res) => {
  const products = db.prepare('SELECT id, product_group FROM products').all();
  const upd = db.prepare('UPDATE products SET min_order = ?, max_order = ? WHERE id = ?');
  const updStock = db.prepare('UPDATE products SET stock = ? WHERE id = ?');
  const tx = db.transaction(() => {
    for (const p of products) {
      let mn = parseInt(req.body['min_' + p.id], 10); if (!Number.isFinite(mn) || mn < 1) mn = 1; if (mn > 100000) mn = 100000;
      let mx = parseInt(req.body['max_' + p.id], 10); if (!Number.isFinite(mx) || mx < 1) mx = 200; if (mx > 100000) mx = 100000;
      if (mx < mn) mx = mn;
      upd.run(mn, mx, p.id);
      // Bestand fuer alle Produkte pflegen (leeres Feld = kein Bestand -> null)
      const rawSt = req.body['stock_' + p.id];
      if (rawSt == null || String(rawSt).trim() === '') {
        updStock.run(null, p.id);
      } else {
        let st = parseInt(rawSt, 10);
        if (!Number.isFinite(st) || st < 0) st = 0; if (st > 100000) st = 100000;
        updStock.run(st, p.id);
      }
    }
  });
  tx();
  req.flash('success', 'Mengen gespeichert.');
  res.redirect('/admin/produkte?ok=1');
});

// Neues Produkt – Formular
router.get('/produkte/neu', requireAdmin, (req, res) => {
  res.render('admin/product-edit', { title: 'Neues Produkt', mode: 'create', p: {
    id: 0, slug: '', name: '', type: '', product_group: 'guellefass', category: 'vakuumfass',
    short_desc: '', description: '', features: '[]', price_cents: 0, compare_cents: null,
    dimensions: '', load_capacity: '', bestseller: 0, sold_out: 0, active: 1, min_order: 10, max_order: 200, sort_order: 0, image: ''
  }});
});

// Neues Produkt – speichern
router.post('/produkte/neu', requireAdmin, (req, res) => {
  const f = readProductForm(req.body);
  if (!f.name) { req.flash('error', 'Bitte einen Produktnamen angeben.'); return res.redirect('/admin/produkte/neu'); }
  const slug = uniqueSlug((req.body.slug && slugify(req.body.slug)) || slugify(f.name));
  let image = '';
  const saved = saveProductImage(req.files && req.files.image, slug);
  if (saved) image = saved;
  db.prepare(`INSERT INTO products
    (slug,name,type,category,product_group,bestseller,sold_out,min_order,max_order,rating_seed_avg,rating_seed_count,dimensions,load_capacity,short_desc,description,features,price_cents,compare_cents,image,color_options,sort_order,active)
    VALUES (@slug,@name,@type,@category,@product_group,@bestseller,@sold_out,@min_order,@max_order,5.0,0,@dimensions,@load_capacity,@short_desc,@description,@features,@price_cents,@compare_cents,@image,@color_options,@sort_order,@active)`)
    .run({ ...f, slug, image });
  const id = db.prepare('SELECT id FROM products WHERE slug = ?').get(slug).id;
  const gal = saveGalleryFiles(req.files && req.files.gallery, slug);
  if (gal.length) db.prepare('UPDATE products SET gallery = ? WHERE id = ?').run(JSON.stringify(gal), id);
  // Bestseller ist pro Kategorie exklusiv: setzt man diesen, verlieren die anderen der Gruppe den Status.
  if (f.bestseller) db.prepare('UPDATE products SET bestseller = 0 WHERE product_group = ? AND id != ?').run(f.product_group, id);
  req.flash('success', 'Produkt angelegt.');
  res.redirect('/admin/produkte/' + id);
});

// Produkt – Formular
router.get('/produkte/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Produkt nicht gefunden.' });
  res.render('admin/product-edit', { title: 'Produkt bearbeiten', mode: 'edit', p });
});

// Produkt – speichern
router.post('/produkte/:id', requireAdmin, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Produkt nicht gefunden.' });
  const f = readProductForm(req.body);
  if (!f.name) { req.flash('error', 'Bitte einen Produktnamen angeben.'); return res.redirect('/admin/produkte/' + p.id); }
  // Alle Bilder (Hauptbild + Galerie) als eine Liste behandeln.
  let allImgs = (p.image ? [p.image] : []).concat(safeArr(p.gallery));
  // 1) Reihenfolge aus dem Formular (per Drag gesetzt) anwenden
  const order = String(req.body.img_order || '').split(',').map(s => s.trim()).filter(Boolean);
  if (order.length) {
    const known = new Set(allImgs);
    const ordered = order.filter(x => known.has(x));
    allImgs.forEach(x => { if (ordered.indexOf(x) === -1) ordered.push(x); }); // nicht gelistete anhängen
    allImgs = ordered;
  }
  // 2) Entfernte Bilder herausnehmen
  const rm = asArray(req.body.rmimg);
  if (rm.length) allImgs = allImgs.filter(g => rm.indexOf(g) === -1);
  // 3) Neu hochgeladene Bilder hinten anhängen
  allImgs = allImgs.concat(saveGalleryFiles(req.files && req.files.gallery, p.slug));
  allImgs = [...new Set(allImgs)];
  // Erstes Bild in der Reihenfolge = Titelbild, Rest = Galerie
  const image = allImgs.length ? allImgs[0] : '';
  const gallery = allImgs.slice(1);
  const tx = db.transaction(() => {
    db.prepare(`UPDATE products SET name=@name, type=@type, product_group=@product_group, category=@category,
      short_desc=@short_desc, description=@description, features=@features, price_cents=@price_cents, compare_cents=@compare_cents,
      dimensions=@dimensions, load_capacity=@load_capacity, bestseller=@bestseller, sold_out=@sold_out, active=@active,
      min_order=@min_order, max_order=@max_order, sort_order=@sort_order, image=@image, gallery=@gallery, color_options=@color_options WHERE id=@id`)
      .run({ ...f, image, gallery: JSON.stringify(gallery), id: p.id });
    // Bestseller ist pro Kategorie exklusiv
    if (f.bestseller) db.prepare('UPDATE products SET bestseller = 0 WHERE product_group = ? AND id != ?').run(f.product_group, p.id);
  });
  tx();
  req.flash('success', 'Produkt gespeichert.');
  res.redirect('/admin/produkte/' + p.id);
});

// Produkt – löschen
router.post('/produkte/:id/loeschen', requireAdmin, (req, res) => {
  if (req.body.confirm !== 'ja') { req.flash('error', 'Löschen abgebrochen.'); return res.redirect('/admin/produkte/' + req.params.id); }
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (p) { db.prepare('DELETE FROM products WHERE id = ?').run(p.id); req.flash('success', 'Produkt „' + p.name + '" gelöscht.'); }
  res.redirect('/admin/produkte');
});

// ---------- Einstellungen: Aktion / Banner / Versand ----------
router.get('/einstellungen', requireAdmin, (req, res) => {
  res.render('admin/settings', { title: 'Admin – Einstellungen', cfg: settingsLib.raw(), saved: req.query.ok === '1' });
});
router.post('/einstellungen', requireAdmin, (req, res) => {
  const b = req.body;
  settingsLib.set('promo_active', b.promo_active ? '1' : '0');
  { const eur2c = (x) => { let v = String(x || '').replace(/[^\d.,]/g, ''); if (v.indexOf(',') > -1) v = v.replace(/\./g, '').replace(',', '.'); return Math.max(0, Math.round((parseFloat(v) || 0) * 100)); }; settingsLib.set('ship_base_cents', String(eur2c(b.shipping_base))); settingsLib.set('ship_perbox_cents', String(eur2c(b.shipping_perbox))); }
  settingsLib.set('promo_end_date', (b.promo_end_date || '').trim());
  settingsLib.set('topbar_text', (b.topbar_text || '').trim());
  settingsLib.set('banner_promo', (b.banner_promo || '').trim());
  settingsLib.set('hero_promo', (b.hero_promo || '').trim());
  settingsLib.set('banner_job', (b.banner_job || '').trim());
  settingsLib.set('banner_promo_active', b.banner_promo_active ? '1' : '0');
  settingsLib.set('banner_job_active', b.banner_job_active ? '1' : '0');
  settingsLib.set('banner_seconds', String(settingsLib.clampSeconds(b.banner_seconds)));
  settingsLib.set('fraud_watch_domains', (b.fraud_watch_domains || '').trim());
  req.flash('success', 'Einstellungen gespeichert.');
  res.redirect('/admin/einstellungen?ok=1');
});

// ---------- Statistik-Dashboard ----------
router.get('/statistik', requireAdmin, (req, res) => {
  const paid = ['bezahlt', 'versand', 'versand_verspaetung', 'versendet'];
  const grossOf = (o) => Math.round((Number(o.subtotal_cents || 0) + Number(o.shipping_cents || 0)) * (1 + Number(o.tax_rate || 19) / 100));
  const paidRows = db.prepare(`SELECT created_at, subtotal_cents, tax_rate FROM orders WHERE status IN (${paid.map(() => '?').join(',')})`).all(...paid);
  let revenueCents = 0; paidRows.forEach(o => { revenueCents += grossOf(o); });
  const orderCount = paidRows.length;
  const avgCents = orderCount ? Math.round(revenueCents / orderCount) : 0;

  const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push({ y: d.getFullYear(), m: d.getMonth(), label: MON[d.getMonth()], cents: 0 }); }
  paidRows.forEach(o => { const d = new Date(String(o.created_at || '').replace(' ', 'T') + 'Z'); const b = months.find(x => x.y === d.getFullYear() && x.m === d.getMonth()); if (b) b.cents += grossOf(o); });
  const maxCents = Math.max(1, ...months.map(x => x.cents));

  const soldStatuses = ['berechnet', 'bezahlt', 'versand', 'versand_verspaetung', 'versendet'];
  const topProducts = db.prepare(`SELECT oi.name AS name, SUM(oi.quantity) AS qty, SUM(oi.unit_cents*oi.quantity) AS rev
      FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN (${soldStatuses.map(() => '?').join(',')})
      GROUP BY oi.name ORDER BY qty DESC LIMIT 8`).all(...soldStatuses);
  const mostViewed = db.prepare('SELECT name, slug, views FROM products WHERE views > 0 ORDER BY views DESC LIMIT 8').all();

  const openRows = db.prepare("SELECT * FROM orders WHERE status='berechnet' ORDER BY (invoice_sent_at IS NULL), invoice_sent_at ASC").all();
  const REMIND_LOCK_MS = 48 * 60 * 60 * 1000; // Erinnerung erst 48 Std. nach Rechnungsausgang
  const open = openRows.map(o => {
    let days = null, sentMs = null;
    if (o.invoice_sent_at) { const d = new Date(String(o.invoice_sent_at).replace(' ', 'T') + 'Z'); sentMs = d.getTime(); days = Math.floor((Date.now() - sentMs) / 86400000); }
    const payDays = parseInt(o.payment_days || '14', 10) || 14;
    // 48-Std.-Sperre: ohne Rechnungsausgang gesperrt; sonst bis Ablauf gesperrt.
    const unlockMs = sentMs != null ? sentMs + REMIND_LOCK_MS : null;
    const remainMs = unlockMs != null ? Math.max(0, unlockMs - Date.now()) : null;
    const locked = sentMs == null || remainMs > 0;
    return Object.assign({}, o, { gross: grossOf(o), days, overdue: days != null && days > payDays, locked, remainMs, hasInvoice: sentMs != null });
  });
  const openTotal = open.reduce((sum, o) => sum + o.gross, 0);

  res.render('admin/statistik', {
    title: 'Admin – Statistik', revenueCents, orderCount, avgCents, months, maxCents,
    topProducts, mostViewed, open, openTotal
  });
});

// ---------- Zahlungserinnerung senden ----------
router.post('/bestellung/:id/erinnerung', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) { req.flash('error', 'Bestellung nicht gefunden.'); return res.redirect('back'); }
  // Schutz: Zahlungserinnerung erst 48 Std. nach Rechnungsausgang (auch wenn der Button manipuliert würde).
  if (!order.invoice_sent_at) { req.flash('error', 'Erinnerung erst nach Rechnungsausgang möglich.'); return res.redirect('back'); }
  const sentMs = new Date(String(order.invoice_sent_at).replace(' ', 'T') + 'Z').getTime();
  if (Date.now() < sentMs + 48 * 60 * 60 * 1000) {
    req.flash('error', 'Zahlungserinnerung ist erst 48 Stunden nach Rechnungsausgang möglich.');
    return res.redirect('back');
  }
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const mail = emails.paymentReminder(order, items);
  sendMail({ to: order.cust_email, subject: mail.subject, html: mail.html, text: mail.text }).catch(err => console.error('Mailfehler (Erinnerung):', err.message));
  db.prepare("UPDATE orders SET reminder_sent_at = datetime('now') WHERE id = ?").run(order.id);
  req.flash('success', `Zahlungserinnerung an ${order.cust_email} gesendet.`);
  res.redirect('back');
});

module.exports = router;
