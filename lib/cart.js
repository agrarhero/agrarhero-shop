// Warenkorb je Kunde als JSON speichern/laden – unterstützt Farb-Varianten als eigene Zeilen.
const db = require('../db');

function loadUserCart(userId) {
  const row = db.prepare('SELECT data FROM user_carts WHERE user_id = ?').get(userId);
  if (!row) return {};
  try { const o = JSON.parse(row.data); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; }
}
function saveUserCart(userId, cart) {
  db.prepare("INSERT INTO user_carts (user_id, data, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=datetime('now')")
    .run(userId, JSON.stringify(cart || {}));
}
function clearUserCart(userId) {
  db.prepare('DELETE FROM user_carts WHERE user_id = ?').run(userId);
}
// Session-Warenkorb beim Login mit gespeichertem zusammenführen (Zeilen-Schlüssel = product|farbe)
function mergeIntoSession(session, userId) {
  const dbCart = loadUserCart(userId);
  const sess = session.cart || {};
  const merged = { ...dbCart };
  for (const [k, line] of Object.entries(sess)) {
    if (!line) continue;
    if (merged[k]) merged[k] = { ...merged[k], quantity: (Number(merged[k].quantity) || 0) + (Number(line.quantity) || 0) };
    else merged[k] = line;
  }
  session.cart = merged;
  saveUserCart(userId, merged);
  return merged;
}
function updatedAt(userId) {
  const row = db.prepare('SELECT updated_at FROM user_carts WHERE user_id = ?').get(userId);
  return row ? row.updated_at : null;
}

module.exports = { loadUserCart, saveUserCart, clearUserCart, mergeIntoSession, updatedAt };
