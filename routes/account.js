// ============================================================
//  Kundenkonto: Übersicht, Bestellungen, Daten, Passwort, Rechnung
// ============================================================
const { Router } = require('../lib/app');
const router = Router();
const fs = require('fs');
const db = require('../db');
const h = require('../lib/helpers');
const stat = require('../lib/status');
const password = require('../lib/password');
const { generateInvoice } = require('../lib/invoice');

function requireLogin(req, res, next) {
  if (!req.user) { req.session.returnTo = req.originalUrl; req.flash('info', 'Bitte melden Sie sich an.'); return res.redirect('/login'); }
  next();
}

// Bestellungen des Nutzers inkl. Artikel (mit Produkt-Slug/Bild)
function ordersOf(userId) {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(userId);
  return orders.map(o => {
    const items = db.prepare(`SELECT oi.*, p.slug AS product_slug, p.image AS product_image
                              FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id
                              WHERE oi.order_id = ?`).all(o.id);
    return { ...o, items, totals: h.totals(items, o.tax_rate, o.shipping_cents), itemCount: items.reduce((s, i) => s + i.quantity, 0) };
  });
}

// ---------- Übersicht ----------
router.get('/', requireLogin, (req, res) => {
  const orders = ordersOf(req.user.id);
  res.render('account/overview', { title: 'Mein Konto', active: 'overview', orders, stat });
});

// ---------- Meine Bestellungen ----------
router.get('/bestellungen', requireLogin, (req, res) => {
  const orders = ordersOf(req.user.id);
  res.render('account/orders', { title: 'Meine Bestellungen', active: 'orders', orders, stat });
});

// ---------- Bestelldetail ----------
router.get('/bestellungen/:nr', requireLogin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.nr);
  if (!order || order.user_id !== req.user.id) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Bestellung nicht gefunden.' });
  const items = db.prepare(`SELECT oi.*, p.slug AS product_slug, p.image AS product_image FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`).all(order.id);
  const totals = h.totals(items, order.tax_rate, order.shipping_cents);
  res.render('account/order-detail', { title: 'Bestellung ' + order.order_number, active: 'orders', order, items, totals, stat });
});

// ---------- Meine Daten ----------
router.get('/daten', requireLogin, (req, res) => {
  res.render('account/data', { title: 'Meine Daten', active: 'data', saved: req.query.ok === '1' });
});
router.post('/daten', requireLogin, (req, res) => {
  const b = req.body;
  db.prepare(`UPDATE users SET salutation=?, first_name=?, last_name=?, company=?, ustid=?, street=?, zip=?, city=?, country=?, phone=? WHERE id=?`)
    .run(b.salutation || '', b.first_name || '', b.last_name || '', b.company || '', b.ustid || '', b.street || '', b.zip || '', b.city || '', b.country || 'Deutschland', b.phone || '', req.user.id);
  const shipDiff = b.ship_diff === 'ja' && (b.ship_street || '').trim();
  db.prepare(`UPDATE users SET ship_first_name=?, ship_last_name=?, ship_company=?, ship_street=?, ship_zip=?, ship_city=?, ship_country=? WHERE id=?`)
    .run(shipDiff ? (b.ship_first_name||'') : '', shipDiff ? (b.ship_last_name||'') : '', shipDiff ? (b.ship_company||'') : '',
         shipDiff ? (b.ship_street||'') : '', shipDiff ? (b.ship_zip||'') : '', shipDiff ? (b.ship_city||'') : '',
         shipDiff ? (b.ship_country||'Deutschland') : '', req.user.id);
  res.redirect('/konto/daten?ok=1');
});

// ---------- Passwort ändern ----------
router.get('/passwort', requireLogin, (req, res) => {
  res.render('account/password', { title: 'Passwort ändern', active: 'password', pwError: null, pwOk: null });
});
router.post('/passwort', requireLogin, (req, res) => {
  const b = req.body;
  const render = (extra) => res.render('account/password', Object.assign({ title: 'Passwort ändern', active: 'password', pwError: null, pwOk: null }, extra));
  if (!password.compareSync(b.current || '', req.user.password_hash)) return render({ pwError: 'Ihr aktuelles Passwort ist nicht korrekt.' });
  { const pe = password.strengthError(b.new); if (pe) return render({ pwError: pe }); }
  if (b.new !== b.new2) return render({ pwError: 'Die neuen Passwörter stimmen nicht überein.' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(password.hashSync(b.new), req.user.id);
  render({ pwOk: 'Ihr Passwort wurde geändert.' });
});

// ---------- Eigene Rechnung als PDF ----------
router.get('/rechnung/:file', requireLogin, async (req, res) => {
  const nr = String(req.params.file || '').replace(/\.pdf$/i, '');
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(nr);
  if (!order || order.user_id !== req.user.id) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Rechnung nicht gefunden.' });
  if (!order.invoice_sent_at) return res.status(403).render('error', { title: 'Noch nicht verfügbar', code: 403, message: 'Für diese Bestellung liegt noch keine Rechnung vor.' });
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const pdfPath = await generateInvoice(order, order.items);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="Rechnung_${order.invoice_number || order.order_number}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

module.exports = router;
