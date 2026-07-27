const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'shop.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  type TEXT NOT NULL, category TEXT NOT NULL, dimensions TEXT, load_capacity TEXT,
  short_desc TEXT, description TEXT, features TEXT, price_cents INTEGER NOT NULL,
  compare_cents INTEGER, image TEXT, active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  first_name TEXT, last_name TEXT, company TEXT, street TEXT, zip TEXT, city TEXT,
  country TEXT DEFAULT 'Deutschland', phone TEXT, is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'neu',
  cust_first_name TEXT, cust_last_name TEXT, cust_company TEXT, cust_email TEXT, cust_phone TEXT,
  cust_street TEXT, cust_zip TEXT, cust_city TEXT, cust_country TEXT, customer_note TEXT,
  subtotal_cents INTEGER NOT NULL DEFAULT 0, tax_rate REAL NOT NULL DEFAULT 19,
  seller_name TEXT, seller_address TEXT, seller_email TEXT, seller_phone TEXT,
  seller_iban TEXT, seller_bic TEXT, seller_bank TEXT, seller_ustid TEXT,
  invoice_number TEXT, invoice_date TEXT, payment_days TEXT, delivery_days TEXT,
  invoice_note TEXT, invoice_sent_at TEXT, admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER,
  name TEXT NOT NULL, type TEXT, unit_cents INTEGER NOT NULL, quantity INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS banned_emails (
  email TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(product_id, user_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY, value TEXT
);
CREATE TABLE IF NOT EXISTS user_carts (
  user_id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT
);
CREATE TABLE IF NOT EXISTS carts (
  user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, quantity INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS guest_visits (
  sid TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ip TEXT, ua TEXT, ref TEXT,
  page_count INTEGER NOT NULL DEFAULT 0,
  pages TEXT NOT NULL DEFAULT '[]',
  cart TEXT NOT NULL DEFAULT '{}',
  geo_ip TEXT, geo_country TEXT, geo_cc TEXT, geo_region TEXT, geo_city TEXT
);
`);

// --- Migrationen: fehlende Spalten in bestehender DB nachziehen ---
function ensureColumns(table, cols) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
  for (const [name, def] of cols) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
  }
}
ensureColumns('products', [
  ['product_group', "TEXT DEFAULT 'guellefass'"],
  ['bestseller', 'INTEGER NOT NULL DEFAULT 0'],
  ['sold_out', 'INTEGER NOT NULL DEFAULT 0'],
  ['min_order', 'INTEGER NOT NULL DEFAULT 1'],
  ['max_order', 'INTEGER NOT NULL DEFAULT 200'],
  ['rating_seed_avg', 'REAL NOT NULL DEFAULT 5.0'],
  ['rating_seed_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['gallery', "TEXT NOT NULL DEFAULT '[]'"],
  ['color_options', "TEXT NOT NULL DEFAULT '[]'"],
  ['views', 'INTEGER NOT NULL DEFAULT 0'],
  ['stock', 'INTEGER'],
  ['baujahr', 'TEXT'],
  ['variants', "TEXT NOT NULL DEFAULT '[]'"],
  ['manual_pdf', 'TEXT'],
  ['safety_note', 'TEXT'],
  ['addon', 'TEXT'],
]);
ensureColumns('users', [
  ['verified', 'INTEGER NOT NULL DEFAULT 1'],
  ['verify_token', 'TEXT'],
  ['verify_expires', 'TEXT'],
  ['reset_token', 'TEXT'],
  ['reset_expires', 'TEXT'],
  ['last_login', 'TEXT'],
  ['last_ip', 'TEXT'],
  ['last_seen', 'TEXT'],
  ['geo_country', 'TEXT'],
  ['geo_country_code', 'TEXT'],
  ['geo_region', 'TEXT'],
  ['geo_ip', 'TEXT'],
  ['customer_type', "TEXT DEFAULT 'firma'"],
  ['salutation', 'TEXT'],
  ['ustid', 'TEXT'],
  ['customer_number', 'TEXT'],
  ['invoice_allowed', 'INTEGER NOT NULL DEFAULT 0'],
  ['min_order_waived', 'INTEGER NOT NULL DEFAULT 0'],
  ['landing_ref', 'TEXT'],
  ['reg_ip', 'TEXT'],
  ['welcome_sent_at', 'TEXT'],
  ['ship_first_name', 'TEXT'], ['ship_last_name', 'TEXT'], ['ship_company', 'TEXT'],
  ['ship_street', 'TEXT'], ['ship_zip', 'TEXT'], ['ship_city', 'TEXT'], ['ship_country', 'TEXT'],
]);

// Zufällige Kundennummern für alle bestehenden Kunden sicherstellen (einmalig)
(function ensureCustomerNumbers() {
  try {
    const crypto = require('crypto');
    const AL = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const gen = () => { const b = crypto.randomBytes(6); let s = ''; for (let i = 0; i < 6; i++) s += AL[b[i] % AL.length]; return 'KD-' + s; };
    const rows = db.prepare("SELECT id FROM users WHERE customer_number IS NULL OR customer_number = ''").all();
    const has = db.prepare('SELECT 1 FROM users WHERE customer_number = ?');
    const upd = db.prepare('UPDATE users SET customer_number = ? WHERE id = ?');
    for (const r of rows) { let n; do { n = gen(); } while (has.get(n)); upd.run(n, r.id); }
  } catch (e) {}
})();

// Einmalige Bereinigung: Platzhalter-USt-IdNr aus bestehenden Bestellungen entfernen
try { db.prepare("UPDATE orders SET seller_ustid='' WHERE seller_ustid='DE000000000'").run(); } catch (e) {}
ensureColumns('orders', [
  ['ip', 'TEXT'],
  ['geo_country', 'TEXT'],
  ['geo_country_code', 'TEXT'],
  ['geo_region', 'TEXT'],
  ['status_before_ignore', 'TEXT'],
  ['opened_at', 'TEXT'],
  ['paid_at', 'TEXT'],
  ['seller_account_holder', 'TEXT'],
  ['payment_method', "TEXT DEFAULT 'vorkasse'"],
  ['reminder_sent_at', 'TEXT'],
  ['shipping_cents', 'INTEGER NOT NULL DEFAULT 0'],
  ['ship_first_name', 'TEXT'], ['ship_last_name', 'TEXT'], ['ship_company', 'TEXT'],
  ['ship_street', 'TEXT'], ['ship_zip', 'TEXT'], ['ship_city', 'TEXT'], ['ship_country', 'TEXT'],
  ['cust_customer_type', 'TEXT'], ['cust_ustid', 'TEXT'], ['seller_taxnumber', 'TEXT'],
]);
ensureColumns('guest_visits', [
  ['suspect', 'INTEGER NOT NULL DEFAULT 0'],
  ['registered_at', 'INTEGER'],
  ['user_id', 'INTEGER'],
]);

// Bestehende Bestellungen auf die aktuelle Standard-Lieferzeit ziehen.
try { db.prepare("UPDATE orders SET delivery_days='3-6' WHERE delivery_days='4-7'").run(); } catch (e) {}
// FLIEGL WFW 4000: nur die vollen Ansichten in der Galerie (Teil-Nahaufnahmen entfernt).
try { db.prepare("UPDATE products SET gallery=? WHERE slug='fliegl-wfw-4000'").run('[\"fliegl-wfw-4000-2.jpg\",\"fliegl-wfw-4000-3.jpg\"]'); } catch (e) {}

db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try { const r = fn(...args); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
};
module.exports = db;
