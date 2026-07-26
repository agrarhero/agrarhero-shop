// Editierbare Shop-Einstellungen (Aktion/Banner/Versand) – key/value in DB.
const db = require('../db');

const DEFAULTS = {
  promo_active: '1',             // Versand-frei-Aktion AKTIV (Versand kostet 0 €)
  promo_end_date: '10.08.2026',
  ship_base_cents: '6900',       // Versand-Grundpreis (Spedition-Basis) je Bestellung, wenn Aktion AUS (Cent). 6900 = 69,00 €
  ship_perbox_cents: '1400',     // Aufpreis je Artikel (Cent). 1400 = 14,00 €.
  topbar_text: 'Kostenloser Versand deutschlandweit · Aktion nur bis {DATUM}',
  banner_promo: 'Versandkostenfrei in ganz Deutschland – Aktion nur bis {DATUM}!',
  hero_promo: 'Versand aktuell kostenlos in ganz Deutschland – bis {DATUM}.',
  // --- Laufender Banner (bis zu 2 abwechselnde Texte) ---
  banner_promo_active: '0',   // Roter Lauf-Banner AUS (Versand-Aktion läuft über Topbar + Hero-Badge)
  banner_job_active: '0',     // Job-Banner aus
  banner_job: 'Wir suchen Verstärkung für unser Team.',
  banner_seconds: '6',        // Anzeigedauer je Text in Sekunden (1–20)
  fraud_watch_domains: 'auktionshilfe',  // Herkunfts-Domains, die als Fake-/Troll-Risiko markiert werden (kommagetrennt)
};

// Anzeigedauer robust auf 1–20 Sekunden begrenzen
function clampSeconds(v) {
  let n = parseInt(v, 10);
  if (isNaN(n)) n = 6;
  return Math.min(20, Math.max(1, n));
}

function all() {
  const out = { ...DEFAULTS };
  try {
    for (const r of db.prepare('SELECT key, value FROM settings').all()) {
      if (r.value != null) out[r.key] = r.value;
    }
  } catch (e) {}
  // Platzhalter {DATUM} füllen
  const d = out.promo_end_date || '';
  // {DATUM} gilt NUR fuer die Aktions-Texte. Der Job-Text hat sein eigenes Datum direkt im Text.
  ['topbar_text', 'banner_promo', 'hero_promo'].forEach(k => { out[k] = String(out[k] || '').replace(/\{DATUM\}/g, d); });
  const bool = (v) => v === '1' || v === 1 || v === true;
  out.promo_active = bool(out.promo_active);
  out.ship_base_cents = parseInt(out.ship_base_cents, 10) || 0;
  out.ship_perbox_cents = parseInt(out.ship_perbox_cents, 10) || 0;
  out.banner_promo_active = bool(out.banner_promo_active);
  out.banner_job_active = bool(out.banner_job_active);
  out.banner_seconds = clampSeconds(out.banner_seconds);
  return out;
}
function raw() {
  const out = { ...DEFAULTS };
  try { for (const r of db.prepare('SELECT key, value FROM settings').all()) if (r.value != null) out[r.key] = r.value; } catch (e) {}
  out.banner_seconds = String(clampSeconds(out.banner_seconds));
  return out;
}
function set(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(value == null ? '' : value));
}
// Einmalige, sichere Text-Aktualisierung: alten Standard-Bannertext automatisch auf die neue
// Version (inkl. "gebraucht") heben – ABER nur, wenn der gespeicherte Text noch EXAKT dem alten
// Standard entspricht. Selbst angepasste Texte bleiben unberuehrt. Idempotent (laeuft folgenlos erneut).
const TEXT_UPGRADES = [
  ['banner_promo',
   'Aktion: ausgewählte Agrartechnik zum Sonderpreis.',
   'Aktion: ausgewählte Agrartechnik zum Sonderpreis.'],
  ['banner_promo',
   'Aktion: ausgewählte Agrartechnik zum Sonderpreis.',
   'Aktion: ausgewählte Agrartechnik zum Sonderpreis.'],
];
function migrateTexts() {
  try {
    const stored = {};
    for (const r of db.prepare('SELECT key, value FROM settings').all()) stored[r.key] = r.value;
    for (const [k, oldT, newT] of TEXT_UPGRADES) { if (stored[k] === oldT) set(k, newT); }
  } catch (e) {}
}
migrateTexts();

module.exports = { all, raw, set, DEFAULTS, clampSeconds };
