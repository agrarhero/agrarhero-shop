const fs = require('fs');
const path = require('path');
const { PDF } = require('./minipdf');
const { euro, dateDE, artNr } = require('./helpers');
const db = require('../db');
// Artikelnummer je Position ermitteln (Slug aus dem Produkt, sonst aus dem Namen abgeleitet).
function itemArtNr(it) {
  let slug = it.slug || '';
  if (!slug && it.product_id) { try { const p = db.prepare('SELECT slug FROM products WHERE id = ?').get(it.product_id); if (p) slug = p.slug; } catch (e) {} }
  return artNr(slug || it.name || '');
}
const INVOICE_DIR = path.join(__dirname, '..', 'data', 'invoices');
if (!fs.existsSync(INVOICE_DIR)) fs.mkdirSync(INVOICE_DIR, { recursive: true });
const INK = '#22331f', STEEL = '#2f5d34', ACCENT = '#4a9b2f', MUTED = '#6d7563', LINE = '#e3e8da';
const L = 50, R = 545, W = R - L;
function generateInvoice(order, items) {
  const taxRate = Number(order.tax_rate ?? 19);
  const subtotal = items.reduce((s, it) => s + it.unit_cents * it.quantity, 0);
  const shipping = Math.max(0, Math.round(Number(order.shipping_cents) || 0));
  const tax = Math.round((subtotal + shipping) * (taxRate / 100));
  const gross = subtotal + shipping + tax;
  const invNo = order.invoice_number || order.order_number;
  const filePath = path.join(INVOICE_DIR, `${invNo.replace(/[^\w\-]/g, '_')}.pdf`);
  const d = new PDF();
  // Logo-Marke: exakt das Website-Logo als eingebettetes Bild
  const LOGO_MARK = path.join(__dirname, '..', 'public', 'img', 'logo-mark.jpg');
  try { d.image(LOGO_MARK, L, 44, 36, 36); } catch (e) { d.rect(L, 44, 36, 36, STEEL); }
  d.text('AGRARHERO', L + 44, 50, { font: 'HB', size: 16, color: INK });
  d.text(order.seller_name || '', L + 44, 72, { size: 8, color: MUTED });
  d.text('RECHNUNG', R - 200, 48, { font: 'HB', size: 22, color: INK, align: 'right', width: 200 });
  let custNo = order.customer_number;
  if (!custNo) { try { const u = require('../db').prepare('SELECT customer_number FROM users WHERE id = ?').get(order.user_id); custNo = u && u.customer_number; } catch (e) {} }
  const meta = [['Rechnungs-Nr.', invNo],['Bestell-Nr.', order.order_number],['Datum', dateDE(order.invoice_date || undefined)],['Kunden-Nr.', custNo || '—']];
  let my = 84;
  meta.forEach(([k, v]) => {
    d.text(k, R - 210, my, { size: 9, color: MUTED });
    d.text(String(v || '—'), R - 100, my, { size: 9, font: 'HB', color: INK, align: 'right', width: 100 });
    my += 14;
  });
  d.text(`${order.seller_name || ''} · ${order.seller_address || ''}`, L, 150, { size: 7.5, color: MUTED });
  const ship = require('./helpers').orderShipping(order);
  let ry = 166;
  if (ship.different) { d.text('Rechnungsadresse', L, ry, { size: 7.5, font: 'HB', color: MUTED }); ry += 12; }
  const rec = [];
  if (order.cust_company) rec.push(order.cust_company);
  rec.push(`${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim());
  if (order.cust_street) rec.push(order.cust_street);
  rec.push(`${order.cust_zip || ''} ${order.cust_city || ''}`.trim());
  if (order.cust_country) rec.push(order.cust_country);
  rec.filter(Boolean).forEach((s) => { d.text(s, L, ry, { size: 10, color: INK }); ry += 14; });
  if (order.cust_customer_type === 'firma' && order.cust_ustid) { d.text('USt-IdNr.: ' + order.cust_ustid, L, ry, { size: 8.5, color: MUTED }); ry += 14; }
  if (ship.different) {
    ry += 10;
    d.text('Lieferadresse', L, ry, { size: 7.5, font: 'HB', color: MUTED }); ry += 12;
    const sh = [];
    if (ship.company) sh.push(ship.company);
    sh.push(`${ship.first_name} ${ship.last_name}`.trim());
    if (ship.street) sh.push(ship.street);
    sh.push(`${ship.zip} ${ship.city}`.trim());
    if (ship.country) sh.push(ship.country);
    sh.filter(Boolean).forEach((s) => { d.text(s, L, ry, { size: 10, color: INK }); ry += 14; });
  }
  let y = Math.max(my, ry) + 22;
  d.line(L, y, R, y, LINE, 1); y += 16;
  d.text(`Rechnung ${invNo}`, L, y, { font: 'HB', size: 11, color: INK }); y += 14;
  d.text('Sofern nicht abweichend angegeben, entspricht das Liefer-/Leistungsdatum dem Datum des Zahlungseingangs bzw. des Versands.', L, y, { size: 8, color: MUTED }); y += 16;
  const cName = L + 30, cQty = L + 300, cUnit = L + 355, cSum = L + 450;
  d.rect(L, y, W, 20, STEEL);
  d.text('Pos.', L + 6, y + 6, { font: 'HB', size: 8.5, color: '#ffffff' });
  d.text('Bezeichnung', cName, y + 6, { font: 'HB', size: 8.5, color: '#ffffff' });
  d.text('Menge', cQty, y + 6, { font: 'HB', size: 8.5, color: '#ffffff', align: 'right', width: 45 });
  d.text('Einzel netto', cUnit - 6, y + 6, { font: 'HB', size: 8.5, color: '#ffffff', align: 'right', width: 78 });
  d.text('Gesamt', cSum - 6, y + 6, { font: 'HB', size: 8.5, color: '#ffffff', align: 'right', width: R - cSum });
  y += 20;
  items.forEach((it, i) => {
    const rowH = 32;
    if (i % 2 === 1) d.rect(L, y, W, rowH, '#f4f6ec');
    d.text(String(i + 1), L + 6, y + 7, { size: 9, color: INK });
    d.text(it.name, cName, y + 7, { font: 'HB', size: 9, color: INK });
    const _sub = 'Art.-Nr. ' + itemArtNr(it) + (it.type ? '  ·  ' + it.type : '');
    d.text(_sub, cName, y + 19, { size: 7.5, color: MUTED });
    d.text(String(it.quantity), cQty, y + 7, { size: 9, color: INK, align: 'right', width: 45 });
    d.text(euro(it.unit_cents), cUnit - 6, y + 7, { size: 9, color: INK, align: 'right', width: 78 });
    d.text(euro(it.unit_cents * it.quantity), cSum - 6, y + 7, { size: 9, color: INK, align: 'right', width: R - cSum });
    y += rowH;
    d.line(L, y, R, y, LINE, 0.5);
  });
  y += 12;
  const sx = L + 300;
  const sumRow = (label, value, bold) => {
    d.text(label, sx, y, { font: bold ? 'HB' : 'H', size: bold ? 11 : 9.5, color: INK });
    d.text(value, sx + 100, y, { font: bold ? 'HB' : 'H', size: bold ? 11 : 9.5, color: INK, align: 'right', width: R - sx - 106 });
    y += bold ? 20 : 15;
  };
  sumRow('Zwischensumme (netto)', euro(subtotal));
  sumRow('Versand', shipping > 0 ? euro(shipping) : 'kostenlos');
  sumRow('Versandkosten', euro(0));
  sumRow(`zzgl. ${taxRate} % MwSt.`, euro(tax));
  d.line(sx, y + 1, R, y + 1, STEEL, 1); y += 7;
  sumRow('Rechnungsbetrag', euro(gross), true);
  y += 10;
  d.rect(L, y, W, 2, ACCENT); y += 14;
  d.text('Zahlungshinweis', L, y, { font: 'HB', size: 10, color: INK }); y += 15;
  const days = order.payment_days || '14', del = order.delivery_days || '3-6';
  y = d.wrap(`Bitte überweisen Sie den Rechnungsbetrag von ${euro(gross)} innerhalb von ${days} Werktagen unter Angabe der Rechnungsnummer ${invNo} auf das unten genannte Konto. Nach Zahlungseingang erfolgt der Versand der Ware innerhalb von ${del} Werktagen.`, L, y, W, { size: 9, color: INK });
  y += 8;
  const boxTop = y + 8;
  d.line(L, boxTop, R, boxTop, LINE, 1);
  d.text('BANKVERBINDUNG', L, boxTop + 8, { font: 'HB', size: 8.5, color: MUTED });
  const holder = order.seller_account_holder || order.seller_name || '';
  d.text(`Kontoinhaber:  ${holder}`, L, boxTop + 22, { size: 9, color: INK });
  d.text(`IBAN:  ${order.seller_iban || ''}`, L, boxTop + 38, { size: 9, color: INK });
  d.text(`BIC:  ${order.seller_bic || ''}`, L + 300, boxTop + 38, { size: 9, color: INK });
  d.text(`Bank:  ${order.seller_bank || ''}`, L, boxTop + 54, { size: 9, color: INK });
  d.text(`Verwendungszweck:  ${invNo}`, L + 300, boxTop + 54, { size: 9, color: INK });
  y = boxTop + 72;

  // Wichtiger 1:1-Hinweis (prominent)
  y += 8;
  d.rect(L, y, W, 0.8, ACCENT);
  y += 10;
  d.text('WICHTIG – bitte genau beachten', L, y, { font: 'HB', size: 9, color: ACCENT }); y += 13;
  y = d.wrap('Bitte \u00fcberweisen Sie ausschlie\u00dflich auf das oben genannte Konto und geben Sie den Verwendungszweck exakt an. '
    + 'Kontoinhaber, IBAN und Verwendungszweck (' + invNo + ') m\u00fcssen 1:1 \u00fcbereinstimmen \u2013 bereits kleine Abweichungen '
    + 'verhindern die eindeutige Zuordnung Ihrer Zahlung und f\u00fchren zu massiven Verz\u00f6gerungen bei Bearbeitung und Lieferung.',
    L, y, W, { size: 8.5, color: INK }); 
  y += 4;

  if (order.invoice_note) y = d.wrap(order.invoice_note, L, y, W, { size: 9, color: MUTED });
  const sInfo = require('./seller').info();
  d.line(L, 796, R, 796, LINE, 0.5);
  d.text(`${order.seller_name || ''} · ${order.seller_address || ''}`, L, 801, { size: 7.5, color: MUTED });
  const legal2 = [];
  if (sInfo.manager) legal2.push(`${sInfo.managerRole || 'Geschäftsführung'}: ${sInfo.manager}`);
  if (sInfo.register) legal2.push(sInfo.register);
  if (legal2.length) d.text(legal2.join('  ·  '), L, 811, { size: 7.5, color: MUTED });
  const taxParts = [];
  if (order.seller_taxnumber) taxParts.push('Steuernr.: ' + order.seller_taxnumber);
  if (order.seller_ustid) taxParts.push('USt-IdNr.: ' + order.seller_ustid);
  const contact = [taxParts.join('  \u00b7  '), order.seller_email || ''].filter(Boolean).join('  \u00b7  ');
  if (contact) d.text(contact, L, 821, { size: 7.5, color: MUTED });
  d.save(filePath);
  return Promise.resolve(filePath);
}
module.exports = { generateInvoice, INVOICE_DIR };
