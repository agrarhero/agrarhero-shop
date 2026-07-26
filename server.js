require('./lib/env').loadEnv();
const path = require('path');
const crypto = require('crypto');
const { createApp } = require('./lib/app');
const db = require('./db');
const helpers = require('./lib/helpers');
const password = require('./lib/password');
const geo = require('./lib/geo');
const settings = require('./lib/settings');
const presence = require('./lib/presence');
const guestlog = require('./lib/guestlog');
const seller = require('./lib/seller');
const app = createApp();
const PORT = Number(process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.use(app.static(path.join(__dirname, 'public')));

// Sicherheits-HTTP-Header (Schutz vor Clickjacking, MIME-Sniffing, Referrer-Leak)
const HTTPS_LIVE = String(process.env.SECURE_COOKIES || '').toLowerCase() === 'true' || /^https:/i.test(String(process.env.BASE_URL || ''));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'");
  if (HTTPS_LIVE) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

const sessions = new Map();
app.use((req, res, next) => {
  let sid = req.cookies['gbsid'];
  if (!sid || !sessions.has(sid)) { sid = crypto.randomBytes(18).toString('hex'); sessions.set(sid, {}); res.cookie('gbsid', sid, { maxAge: 1000*60*60*24*14 }); }
  req.sessionId = sid;
  req.session = sessions.get(sid);
  if (!req.session.cart) req.session.cart = {};
  // Herkunft (Referrer) der ersten Seite dieser Sitzung merken – nur externe Domains.
  if (req.session.landingRef === undefined) {
    try {
      const rf = req.headers['referer'] || '';
      let dom = '';
      if (rf) { const u = new URL(rf); const host = (req.headers.host || '').split(':')[0]; if (u.hostname && u.hostname !== host) dom = u.hostname.replace(/^www\./, ''); }
      req.session.landingRef = dom;
    } catch (e) { req.session.landingRef = ''; }
  }
  next();
});
app.use((req, res, next) => {
  req.user = null;
  if (req.session.userId) req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) || null;
  if (req.user) {
    const ip = geo.clientIp(req) || '';
    db.prepare("UPDATE users SET last_ip=?, last_seen=datetime('now') WHERE id=?").run(ip, req.user.id);
    req.user.last_ip = ip;
    // Herkunft am Konto nachtragen, falls noch leer und diese Sitzung eine externe Herkunft hat.
    if (!req.user.landing_ref && req.session.landingRef) {
      try { db.prepare('UPDATE users SET landing_ref=? WHERE id=?').run(req.session.landingRef, req.user.id); req.user.landing_ref = req.session.landingRef; } catch (e) {}
    }
  }
  // Live-Praesenz festhalten (In-Memory). Statische Dateien erreichen diese
  // Middleware nicht, daher zaehlt hier nur echte Seiten-/Route-Aktivitaet.
  presence.touch(req.sessionId, req.user ? req.user.id : null, req.headers['user-agent'], req.originalUrl || req.path || '/');
  if (!req.user) guestlog.record(req);
  next();
});
app.use((req, res, next) => {
  const cart = req.session.cart || {};
  const keys = Object.keys(cart);
  let count = 0, net = 0;
  if (keys.length) {
    const ids = [...new Set(keys.map(k => cart[k] && cart[k].product_id).filter(Boolean))];
    if (ids.length) {
      const rows = db.prepare(`SELECT id, price_cents FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
      const price = {}; rows.forEach(r => { price[r.id] = r.price_cents; });
      keys.forEach(k => { const l = cart[k]; if (!l || typeof l !== 'object') return; const q = Number(l.quantity) || 0; count += q; net += (price[l.product_id] || 0) * q; });
    }
  }
  res.locals.cartCount = count;
  res.locals.cartTotalCents = Math.round(net * 1.19);
  res.locals.settings = settings.all();
  try { res.locals.hasUsed = !!db.prepare("SELECT 1 FROM products WHERE product_group='gebraucht' AND active=1 LIMIT 1").get(); } catch (e) { res.locals.hasUsed = false; }
  res.locals.user = req.user;
  res.locals.h = helpers;
  res.locals.seller = seller.info();
  res.locals.flash = req.session.flash || null;
  res.locals.baseUrl = (process.env.BASE_URL || 'https://agrarhero.de').replace(/\/+$/, '');
  res.locals.currentUrl = req.originalUrl || req.path || '/';
  res.locals.currentPath = req.path;
  delete req.session.flash;
  req.flash = (type, msg) => { req.session.flash = { type, msg }; };
  next();
});
app.use('/', require('./routes/shop'));
app.use('/', require('./routes/auth'));
app.use('/konto', require('./routes/account'));
app.use('/admin', require('./routes/admin'));
app.setNotFound((req, res) => res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Diese Seite existiert nicht.' }));
app.setErrorHandler((err, req, res) => { console.error(err); if (!res.headersSent) res.status(500).render('error', { title: 'Fehler', code: 500, message: 'Es ist ein Fehler aufgetreten.' }); });
function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || '';
  if (!email || !pass) return;
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) { if (!existing.is_admin) db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(existing.id); return; }
  db.prepare('INSERT INTO users (email,password_hash,first_name,last_name,is_admin) VALUES (?,?,?,?,1)').run(email, password.hashSync(pass), 'Admin', '');
  console.log(`  Admin-Konto angelegt: ${email}`);
}
function ensureProducts() { const n = db.prepare('SELECT COUNT(*) AS n FROM products').get().n; if (n === 0) console.log('  Keine Produkte \u2013 bitte "node seed.js" ausf\u00fchren.'); }
ensureAdmin(); ensureProducts();
// Fehlende Produkte idempotent nachziehen (ON CONFLICT DO NOTHING).
try { require('./seed').seedProducts(); } catch (e) { console.error('Produkt-Seed:', e.message); }
app.listen(PORT, () => { console.log(`Agrarhero: http://localhost:${PORT}  | Admin: /admin`); });
