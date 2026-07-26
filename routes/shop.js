const { Router } = require('../lib/app');
const router = Router();
const db = require('../db');
const h = require('../lib/helpers');
const { sendMail } = require('../lib/mailer');
const emails = require('../lib/emails');
const geo = require('../lib/geo');
const cart = require('../lib/cart');
const ratings = require('../lib/ratings');
const ids = require('../lib/ids');
const inventory = require('../lib/inventory');

// Heartbeat: haelt die Live-Praesenz aktuell und laesst geschlossene Tabs
// zeitnah wieder aus der "online"-Zaehlung fallen. Praesenz wird bereits in
// der globalen Middleware (server.js) erfasst - hier nur schnell 204 zurueck.
router.get('/aktiv', (req, res) => { res.statusCode = 204; res.end(); });

// ---------- SEO: robots.txt + sitemap.xml ----------
function siteBase() { return (process.env.BASE_URL || 'https://agrarhero.de').replace(/\/+$/, ''); }
router.get('/robots.txt', (req, res) => {
  const base = siteBase();
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /konto\nDisallow: /kasse\nDisallow: /warenkorb\nDisallow: /login\nDisallow: /registrieren\n\nSitemap: ${base}/sitemap.xml\n`);
});
router.get('/sitemap.xml', (req, res) => {
  const base = siteBase();
  const staticUrls = ['/', '/produkte?gruppe=guellefass', '/produkte?gruppe=seilwinde', '/produkte?gruppe=saege', '/produkte?gruppe=erntebox', '/kontakt', '/karriere', '/impressum', '/agb', '/datenschutz'];
  let prods = [];
  try { prods = db.prepare("SELECT slug FROM products WHERE active = 1 ORDER BY sort_order, id").all(); } catch (e) {}
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const u of staticUrls) xml += `  <url><loc>${esc(base + u)}</loc></url>\n`;
  for (const pr of prods) xml += `  <url><loc>${esc(base + '/produkt/' + pr.slug)}</loc></url>\n`;
  xml += '</urlset>\n';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.send(xml);
});
function buildCart(session, settings) {
  const cart = session.cart || {};
  const keys = Object.keys(cart);
  if (keys.length === 0) return { items: [], totals: h.totals([], 19, 0) };
  const ids = [...new Set(keys.map(k => cart[k].product_id))];
  const rows = db.prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = {}; rows.forEach(r => { byId[r.id] = r; });
  const items = keys.map(k => {
    const line = cart[k]; const p = byId[line.product_id];
    if (!p) return null;
    if (line.addon) {
      return { product: { slug: p.slug, image: line.addon_image || p.image }, key: k, id: p.id, name: line.addon_label || 'Zubehör', type: 'Zubehör', unit_cents: Number(line.addon_cents) || 0, quantity: Number(line.quantity) || 1, addon: true };
    }
    const unit = (line.variant_cents != null) ? Number(line.variant_cents) : p.price_cents;
    return { product: p, key: k, id: p.id, name: p.name, type: p.type, unit_cents: unit, quantity: Number(line.quantity) || 1, color: line.color || null, variant: line.variant || null };
  }).filter(Boolean);
  return { items, totals: h.totals(items, 19, shipCents(settings, items)) };
}
function persistCart(req) { if (req.user) cart.saveUserCart(req.user.id, req.session.cart || {}); }
function cartSummary(session) {
  const cart = session.cart || {};
  const keys = Object.keys(cart);
  let count = 0, net = 0;
  if (keys.length) {
    const ids = [...new Set(keys.map(k => cart[k] && cart[k].product_id).filter(Boolean))];
    if (ids.length) {
      const rows = db.prepare(`SELECT id, price_cents FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
      const price = {}; rows.forEach(r => { price[r.id] = r.price_cents; });
      keys.forEach(k => { const l = cart[k]; if (!l) return; const q = Number(l.quantity) || 0; count += q; const unit = (l.variant_cents != null) ? Number(l.variant_cents) : (l.addon_cents != null ? Number(l.addon_cents) : (price[l.product_id] || 0)); net += unit * q; });
    }
  }
  return { count, gross: Math.round(net * 1.19) };
}
// Speditions-Versandkosten (netto): bei aktiver Aktion kostenlos, sonst fair gestaffelt.
// Modell wie im Speditionsversand: GRUNDPREIS (Anfahrt/erster Palettenplatz, deutschlandweit)
// + Aufpreis je Artikel. Glatt steigend, keine Spruenge.
function shipCents(settings, items) {
  const s = settings || {};
  if (s.promo_active) return 0;
  const base = Number(s.ship_base_cents) || 0;
  const perBox = Number(s.ship_perbox_cents) || 0;
  if (!items || !items.length) return 0;
  let gitter = 0, pal = 0;
  items.forEach(it => {
    const g = (it.product && it.product.product_group) || '';
    const q = Number(it.quantity) || 0;
    if (g === 'palette') pal += q; else gitter += q;
  });
  if (gitter === 0 && pal === 0) return 0;
  const perPal = Math.round(perBox / 5);
  return base + perBox * gitter + perPal * pal;
}
function sendJson(res, obj) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.send(JSON.stringify(obj)); }
function isReturningCustomer(userId){ return !!db.prepare("SELECT 1 FROM orders WHERE user_id = ? AND status IN ('bezahlt','versand','versand_verspaetung','versendet') LIMIT 1").get(userId); }
router.get('/', (req, res) => {
  const withImg = "active = 1 AND image IS NOT NULL AND image != ''";
  // Genau EIN Bestseller je Kategorie (product_group). Kommt eine neue Kategorie mit
  // markiertem Bestseller dazu, erscheint sie hier automatisch mit.
  let products = db.prepare(`SELECT * FROM products p WHERE ${withImg} AND bestseller = 1
      AND id = (SELECT id FROM products WHERE product_group = p.product_group AND bestseller = 1 AND ${withImg} ORDER BY sort_order, id LIMIT 1)
    ORDER BY sort_order, id`).all();
  if (products.length === 0) products = db.prepare(`SELECT * FROM products WHERE ${withImg} ORDER BY sort_order, id LIMIT 8`).all();
  ratings.decorateAll(products);
  const groupCounts = {};
  try { db.prepare("SELECT product_group AS g, COUNT(*) AS n FROM products WHERE active = 1 GROUP BY product_group").all().forEach(function(r){ groupCounts[r.g] = r.n; }); } catch (e) {}
  res.render('index', { title: 'Agrarhero – Agrartechnik & Hofbedarf für Hof, Stall, Feld & Forst', metaDesc: 'Ihr Fachhändler für Agrartechnik und Hofbedarf. Gülletechnik, Forsttechnik und mehr, faire Preise, deutschlandweite Lieferung.', products, groupCounts });
});
router.get('/produkte', (req, res) => {
  const gruppe = req.query.gruppe || '';
  const cat = req.query.kat || '';
  const base = "SELECT * FROM products WHERE active = 1 AND image IS NOT NULL AND image != ''";
  let products;
  if (gruppe) products = db.prepare(base + ' AND product_group = ? ORDER BY sort_order, id').all(gruppe);
  else if (cat) products = db.prepare(base + ' AND category = ? ORDER BY sort_order, id').all(cat);
  else products = db.prepare(base + ' ORDER BY sort_order, id').all();
  const title = gruppe === 'guellefass' ? 'Güllefässer / Wasserwagen – Sortiment'
    : gruppe === 'seilwinde' ? 'Seilwinden – Sortiment'
    : gruppe === 'saege' ? 'Sägen – Sortiment'
    : gruppe === 'erntebox' ? 'Ernteboxen – Sortiment'
    : 'Sortiment';
  const metaDesc = gruppe === 'guellefass' ? 'Güllefässer, Pumptankwagen und Wasserfasswagen kaufen – robuste Fasstechnik für Hof, Feld und Kommune. Faire Preise, deutschlandweite Lieferung.'
    : gruppe === 'seilwinde' ? 'Forstseilwinden kaufen – mechanisch und hydraulisch, mit Funksteuerung. Robuste Technik zum fairen Preis, deutschlandweit.'
    : gruppe === 'saege' ? 'Motor- und Kettensägen für Forst und Hof – Profi-Technik zum fairen Preis, deutschlandweit geliefert.'
    : gruppe === 'erntebox' ? 'Ernteboxen und Großkisten für Obst, Gemüse und Lagerung – robust und stapelbar, deutschlandweite Lieferung.'
    : 'Agrartechnik von Agrarhero – Güllefässer, Seilwinden, Sägen, Ernteboxen und mehr. Faire Preise, deutschlandweite Lieferung.';
  ratings.decorateAll(products);
  res.render('catalog', { title, metaDesc, products, gruppe });
});
router.get('/produkt/:slug', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE slug = ?').get(req.params.slug);
  if (!p) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Produkt nicht gefunden.' });
  p.featureList = h.safeParse(p.features, []);
  try { db.prepare('UPDATE products SET views = views + 1 WHERE id = ?').run(p.id); } catch (e) {}
  ratings.decorate(p);
  const canReview = req.user ? ratings.canReview(req.user.id, p.id) : false;
  const hasReviewed = req.user ? ratings.hasReviewed(req.user.id, p.id) : false;
  const metaDesc = (p.short_desc && p.short_desc.trim()) ? p.short_desc.trim() : (p.name + ' bei Agrarhero kaufen – Bestpreis, direkt ab Lager, deutschlandweiter Versand.');
  res.render('product', { title: p.name + ' kaufen', metaDesc, p, canReview, hasReviewed });
});
router.get('/warenkorb', (req, res) => {
  const { items, totals } = buildCart(req.session, res.locals.settings);
  res.render('cart', { title: 'Warenkorb', items, totals });
});
router.post('/warenkorb/hinzufuegen', (req, res) => {
  const wantsJson = (req.headers['x-requested-with'] === 'fetch') || (String(req.headers.accept || '').indexOf('application/json') !== -1);
  const fail = (msg) => { if (wantsJson) return sendJson(res, { ok: false, error: msg }); req.flash('error', msg); return res.redirect('back'); };
  const done = (msg) => {
    persistCart(req);
    if (wantsJson) { const sum = cartSummary(req.session); return sendJson(res, { ok: true, message: msg, count: sum.count, totalCents: sum.gross, totalFormatted: h.euro(sum.gross) }); }
    req.flash('cartadd', msg); return res.redirect('back');
  };
  const pid = parseInt(req.body.product_id, 10);
  const qty = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const p = db.prepare('SELECT id, sold_out, min_order, max_order, color_options, variants, addon FROM products WHERE id = ? AND active = 1').get(pid);
  if (!p) return fail('Artikel nicht gefunden.');
  if (p.sold_out) return fail('Dieser Artikel ist derzeit ausverkauft.');
  const opts = h.safeParse(p.color_options, []);
  let color = null;
  if (opts.length) {
    const chosen = String(req.body.color || '');
    if (opts.indexOf(chosen) === -1) return fail('Bitte wählen Sie zuerst eine Farbe aus.');
    color = chosen;
  }
  // Ausführungs-/Längen-Varianten mit eigenem Preis (Preis serverseitig aus der DB, nicht aus dem Formular).
  const variants = h.safeParse(p.variants, []);
  let variant = null, variantCents = null;
  if (variants.length) {
    const chosen = String(req.body.variant || '');
    const found = variants.find(v => v && String(v.label) === chosen);
    if (!found) return fail('Bitte wählen Sie zuerst eine Ausführung aus.');
    variant = found.label; variantCents = Number(found.price_cents) || null;
  }
  const key = String(pid) + (color ? '::' + color : '') + (variant ? '::' + variant : '');
  const min = (req.user && req.user.min_order_waived) ? 1 : Math.max(1, p.min_order || 1);
  const max = Math.max(min, p.max_order || 200);
  const cur = (req.session.cart[key] && Number(req.session.cart[key].quantity)) || 0;
  const neu = cur + qty;
  if (neu < min) return fail(`Für diesen Artikel gilt eine Mindestbestellmenge von ${min} Stück. Bitte legen Sie mindestens ${min} Stück in den Warenkorb.`);
  if (neu > max) return fail(`Für Mengen über ${max} Stück kontaktieren Sie uns bitte für ein individuelles Angebot – gerne über unser Kontaktformular.`);
  req.session.cart[key] = { product_id: pid, color: color, variant: variant, variant_cents: variantCents, quantity: neu };
  // Optionales Zubehör (Add-on) mitbestellen – als eigene Warenkorb-Zeile, Preis serverseitig aus der DB.
  const addonDef = h.safeParse(p.addon, null);
  if (String(req.body.addon || '') === '1' && addonDef && addonDef.price_cents) {
    const akey = String(pid) + '::addon';
    const acur = (req.session.cart[akey] && Number(req.session.cart[akey].quantity)) || 0;
    req.session.cart[akey] = { product_id: pid, addon: true, addon_label: addonDef.label, addon_cents: Number(addonDef.price_cents), addon_image: addonDef.image || null, quantity: acur + qty };
  }
  return done(variant ? `${qty}× ${variant} in den Warenkorb gelegt.` : (color ? `${qty} Stück in ${color} in den Warenkorb gelegt.` : 'Artikel wurde in den Warenkorb gelegt.'));
});
router.post('/warenkorb/aktualisieren', (req, res) => {
  const key = String(req.body.key || '');
  const line = req.session.cart[key];
  let qty = parseInt(req.body.quantity, 10);
  if (line && qty > 0) {
    const p = db.prepare('SELECT min_order, max_order FROM products WHERE id = ?').get(line.product_id);
    const min = (req.user && req.user.min_order_waived) ? 1 : Math.max(1, (p && p.min_order) || 1);
    const max = Math.max(min, (p && p.max_order) || 200);
    if (qty < min) { qty = min; req.flash('info', `Mindestbestellmenge für diesen Artikel: ${min} Stück.`); }
    if (qty > max) { qty = max; req.flash('info', `Für Mengen über ${max} Stück kontaktieren Sie uns bitte direkt.`); }
    req.session.cart[key] = { product_id: line.product_id, color: line.color || null, variant: line.variant || null, variant_cents: (line.variant_cents != null ? line.variant_cents : null), addon: line.addon || false, addon_label: line.addon_label || null, addon_cents: (line.addon_cents != null ? line.addon_cents : null), addon_image: line.addon_image || null, quantity: qty };
  } else if (line) { delete req.session.cart[key]; }
  persistCart(req);
  res.redirect('/warenkorb');
});
router.post('/warenkorb/entfernen', (req, res) => {
  const key = String(req.body.key || '');
  delete req.session.cart[key];
  persistCart(req);
  res.redirect('/warenkorb');
});
router.get('/kasse', (req, res) => {
  const { items, totals } = buildCart(req.session, res.locals.settings);
  if (items.length === 0) { req.flash('info', 'Ihr Warenkorb ist leer.'); return res.redirect('/warenkorb'); }
  if (!req.user) { req.session.returnTo = '/kasse'; req.flash('info', 'Bitte melden Sie sich an oder registrieren Sie sich, um die Bestellung abzuschließen.'); return res.redirect('/login'); }
  res.render('checkout', { title: 'Kasse', items, totals, rechnungFrei: !!req.user.invoice_allowed });
});
router.post('/kasse', (req, res) => {
  if (!req.user) return res.redirect('/login');
  const { items, totals } = buildCart(req.session, res.locals.settings);
  if (items.length === 0) return res.redirect('/warenkorb');
  const b = req.body, u = req.user;
  if (!b.agb) { req.flash('error', 'Bitte akzeptieren Sie die AGB und die Datenschutzerklärung.'); return res.redirect('/kasse'); }
  if (b.ship_diff === 'ja' && (!(b.ship_street||'').trim() || !(b.ship_zip||'').trim() || !(b.ship_city||'').trim())) {
    req.flash('error', 'Bitte geben Sie für die abweichende Lieferadresse Straße, PLZ und Ort an.'); return res.redirect('/kasse');
  }
  const taxRate = Number(process.env.SELLER_TAXRATE || 19);
  const shipping = totals.shipping;
  const info = db.prepare(`INSERT INTO orders (
      order_number, user_id, status, cust_first_name, cust_last_name, cust_company, cust_email, cust_phone,
      cust_street, cust_zip, cust_city, cust_country, customer_note, subtotal_cents, tax_rate, shipping_cents,
      seller_name, seller_address, seller_email, seller_phone, seller_iban, seller_bic, seller_bank, seller_ustid,
      payment_days, delivery_days) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'TEMP', u.id, 'neu',
    b.first_name || u.first_name, b.last_name || u.last_name, b.company || u.company || '',
    b.email || u.email, b.phone || u.phone || '',
    b.street || u.street || '', b.zip || u.zip || '', b.city || u.city || '', b.country || u.country || 'Deutschland',
    b.note || '', totals.subtotal, taxRate, shipping,
    process.env.SELLER_NAME || '', process.env.SELLER_ADDRESS || '', process.env.SELLER_EMAIL || '', process.env.SELLER_PHONE || '',
    process.env.SELLER_IBAN || '', process.env.SELLER_BIC || '', process.env.SELLER_BANK || '', process.env.SELLER_USTID || '',
    process.env.PAYMENT_DAYS || '14', process.env.DELIVERY_DAYS || '3-6');
  const orderId = info.lastInsertRowid;
  const orderNo = ids.uniqueOrderNumber();
  db.prepare('UPDATE orders SET order_number = ? WHERE id = ?').run(orderNo, orderId);
  db.prepare('UPDATE orders SET ip = ? WHERE id = ?').run(geo.clientIp(req) || '', orderId);
  try {
    db.prepare('UPDATE orders SET cust_customer_type = ?, cust_ustid = ? WHERE id = ?')
      .run(u.customer_type || 'firma', (u.customer_type === 'firma') ? (u.ustid || '') : '', orderId);
  } catch (e) { console.error('Snapshot Firma/USt-IdNr:', e.message); }
  try { db.prepare('UPDATE orders SET seller_taxnumber = ? WHERE id = ?').run(process.env.SELLER_TAXNUMBER || '', orderId); } catch (e) {}
  const pm = (req.body.payment_method === 'rechnung' && u.invoice_allowed) ? 'rechnung' : 'vorkasse';
  db.prepare('UPDATE orders SET payment_method = ? WHERE id = ?').run(pm, orderId);
  if (b.ship_diff === 'ja' && (b.ship_street || '').trim()) {
    try {
      db.prepare('UPDATE orders SET ship_first_name=?, ship_last_name=?, ship_company=?, ship_street=?, ship_zip=?, ship_city=?, ship_country=? WHERE id=?')
        .run(b.ship_first_name || '', b.ship_last_name || '', b.ship_company || '', b.ship_street || '', b.ship_zip || '', b.ship_city || '', b.ship_country || 'Deutschland', orderId);
    } catch (e) { console.error('Snapshot Lieferadresse:', e.message); }
  }
  const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, type, unit_cents, quantity) VALUES (?,?,?,?,?,?)');
  const tx = db.transaction(() => { for (const it of items) insItem.run(orderId, it.id, it.name + (it.variant ? ' – ' + it.variant : '') + (it.color ? ' – Farbe: ' + it.color : ''), it.type, it.unit_cents, it.quantity); });
  tx();
  // Lagerbestand abbuchen (Produkte mit gesetztem stock).
  try { inventory.decrementForItems(items); } catch (e) { console.error('Bestand abbuchen:', e.message); }
  db.prepare(`UPDATE users SET first_name=?, last_name=?, company=?, street=?, zip=?, city=?, country=?, phone=? WHERE id=?`)
    .run(b.first_name || u.first_name, b.last_name || u.last_name, b.company || u.company || '', b.street || u.street || '',
         b.zip || u.zip || '', b.city || u.city || '', b.country || u.country || 'Deutschland', b.phone || u.phone || '', u.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const mail = emails.orderConfirmation(order, items);
  sendMail({ to: order.cust_email, subject: mail.subject, html: mail.html, text: mail.text }).catch(err => console.error('Mailfehler (Bestätigung):', err.message));
  req.session.cart = {};
  cart.clearUserCart(u.id);
  res.redirect('/bestellung/' + orderNo);
});
router.get('/bestellung/:nr', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.nr);
  if (!order) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Bestellung nicht gefunden.' });
  if (!req.user || (req.user.id !== order.user_id && !req.user.is_admin)) return res.status(403).render('error', { title: 'Kein Zugriff', code: 403, message: 'Diese Bestellung gehört nicht zu Ihrem Konto.' });
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.render('order-confirmation', { title: 'Bestellung ' + order.order_number, order, items, totals: h.totals(items, order.tax_rate, order.shipping_cents) });
});
router.get('/kontakt', (req, res) => res.render('contact', { title: 'Kontakt' }));
router.post('/kontakt', async (req, res) => {
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const message = String(req.body.message || '').trim();
  if (!name || !email || !message) { req.flash('error', 'Bitte fuellen Sie alle Felder aus.'); return res.redirect('/kontakt'); }
  const to = process.env.SELLER_EMAIL || 'info@agrarhero.de';
  const subject = `Kontaktanfrage von ${name}`;
  const text = `Neue Kontaktanfrage ueber agrarhero.de\n\nName: ${name}\nE-Mail: ${email}\n\nNachricht:\n${message}\n`;
  const html = `<h2 style="font-family:Arial;color:#22331f">Neue Kontaktanfrage</h2><p style="font-family:Arial"><b>Name:</b> ${esc(name)}<br><b>E-Mail:</b> ${esc(email)}</p><p style="font-family:Arial;white-space:pre-wrap;border-left:3px solid #4a9b2f;padding-left:12px">${esc(message)}</p>`;
  try { await sendMail({ to, subject, text, html, replyTo: email }); }
  catch (e) { console.error('Kontakt-Mail-Fehler:', e.message); }
  req.flash('success', 'Vielen Dank! Ihre Nachricht wurde gesendet - wir melden uns zuegig bei Ihnen.');
  res.redirect('/kontakt');
});
router.get('/karriere', (req, res) => res.render('karriere', { title: 'Karriere – Lagermitarbeiter (m/w/d)' }));
router.get('/agb', (req, res) => res.render('agb', { title: 'AGB' }));
router.get('/datenschutz', (req, res) => res.render('datenschutz', { title: 'Datenschutz' }));
router.get('/impressum', (req, res) => res.render('impressum', { title: 'Impressum' }));
router.post('/produkt/:slug/bewerten', (req, res) => {
  const p = db.prepare('SELECT id, slug FROM products WHERE slug = ?').get(req.params.slug);
  if (!p) return res.status(404).render('error', { title: 'Nicht gefunden', code: 404, message: 'Produkt nicht gefunden.' });
  if (!req.user) { req.session.returnTo = '/produkt/' + p.slug; req.flash('info', 'Bitte melden Sie sich an, um zu bewerten.'); return res.redirect('/login'); }
  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) { req.flash('error', 'Bitte eine Bewertung von 1 bis 5 Sternen wählen.'); return res.redirect('/produkt/' + p.slug); }
  if (!ratings.canReview(req.user.id, p.id)) { req.flash('error', 'Sie können dieses Produkt erst bewerten, nachdem Sie es gekauft und erhalten haben.'); return res.redirect('/produkt/' + p.slug); }
  if (ratings.hasReviewed(req.user.id, p.id)) { req.flash('info', 'Sie haben dieses Produkt bereits bewertet.'); return res.redirect('/produkt/' + p.slug); }
  db.prepare('INSERT INTO reviews (product_id, user_id, rating) VALUES (?,?,?)').run(p.id, req.user.id, rating);
  req.flash('success', 'Vielen Dank für Ihre Bewertung!');
  res.redirect('/produkt/' + p.slug);
});

module.exports = router;
