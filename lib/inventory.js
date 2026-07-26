// Lagerbestand für Produkte mit gesetztem stock. Produkte mit stock = NULL
// bleiben unbegrenzt verfügbar.
const db = require('../db');

// Bestand beim Bestellen abbuchen. items: [{ id, quantity }]
// Nur Produkte mit gesetztem stock werden reduziert, nie unter 0.
function decrementForItems(items) {
  const upd = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ? AND stock IS NOT NULL');
  for (const it of items || []) {
    const q = Number(it.quantity) || 0;
    if (it.id && q > 0) upd.run(q, it.id);
  }
}

// Bestand einer Bestellung zurückbuchen (z. B. wenn ein Kunde aus dem System
// geworfen/gebannt wird). Läuft über die order_items der Bestellung.
function restockOrder(orderId) {
  const rows = db.prepare(
    `SELECT oi.product_id AS pid, oi.quantity AS q
       FROM order_items oi JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ? AND p.stock IS NOT NULL`
  ).all(orderId);
  const upd = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ? AND stock IS NOT NULL');
  for (const r of rows) upd.run(Number(r.q) || 0, r.pid);
}

// Verfügbarkeit eines Produkts (true, wenn bestellbar).
function inStock(p) {
  if (!p) return false;
  if (p.stock == null) return true;      // kein Bestandslimit
  return Number(p.stock) > 0;
}

module.exports = { decrementForItems, restockOrder, inStock };
