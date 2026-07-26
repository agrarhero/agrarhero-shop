// ============================================================
//  Zufällige, NICHT fortlaufende Nummern (Bestellung/Rechnung/Kunde)
//  -> Wettbewerber können aus den Nummern keine Mengen ableiten.
//  Eindeutigkeit wird gegen die Datenbank geprüft.
// ============================================================
const db = require('../db');
const crypto = require('crypto');
// Ohne 0/O/1/I/L – gut lesbar, keine Verwechslung
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function code(n) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}
function uniqueOrderNumber() {
  let n; do { n = `AH-${code(4)}-${code(4)}`; } while (db.prepare('SELECT 1 FROM orders WHERE order_number = ?').get(n));
  return n;
}
function uniqueInvoiceNumber() {
  let n; do { n = `RE-${code(4)}-${code(4)}`; } while (db.prepare('SELECT 1 FROM orders WHERE invoice_number = ?').get(n));
  return n;
}
function uniqueCustomerNumber() {
  let n; do { n = `KD-${code(6)}`; } while (db.prepare('SELECT 1 FROM users WHERE customer_number = ?').get(n));
  return n;
}
module.exports = { code, uniqueOrderNumber, uniqueInvoiceNumber, uniqueCustomerNumber };
