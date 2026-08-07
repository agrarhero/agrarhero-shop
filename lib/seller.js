// Einzige Quelle für die Verkäufer-/Firmendaten. Die Werte kommen bevorzugt aus den
// über das Admin-Panel bearbeitbaren Einstellungen (DB, settings-Tabelle, Präfix "seller_")
// und fallen sonst auf die .env-Variablen zurück. So kann das Impressum jederzeit im
// Admin-Panel geändert werden, ohne dass ein Deploy nötig ist. Wird in Views
// (res.locals.seller), in der Rechnung und in E-Mails genutzt. Marke (brand) bleibt Agrarhero,
// rechtlicher Verkäufer/Rechnungssteller ist die Firma (name + legalForm + register + manager).
const settings = require('./settings');

function cleanPhone(p) {
  const raw = String(p || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').replace(/^49/, '');
  // Platzhalter-Nummern (nur Nullen) nicht anzeigen
  if (!digits || /^0*$/.test(digits)) return '';
  return raw;
}
function info() {
  let cfg = {};
  try { cfg = settings.raw() || {}; } catch (e) { cfg = {}; }
  // Bevorzugt DB-Wert (aus dem Admin-Panel), sonst .env-Fallback.
  const pick = (dbVal, envVal) => {
    const v = String(dbVal == null ? '' : dbVal).trim();
    return v || String(envVal || '').trim();
  };
  const addr = pick(cfg.seller_address, process.env.SELLER_ADDRESS);
  const ci = addr.indexOf(',');
  const street = ci >= 0 ? addr.slice(0, ci).trim() : addr;
  const cityLine = ci >= 0 ? addr.slice(ci + 1).trim() : '';
  const court = pick(cfg.seller_register_court, process.env.SELLER_REGISTER_COURT);
  const regNo = pick(cfg.seller_register_no, process.env.SELLER_REGISTER_NO);
  // Geschäftsführung (mehrere Namen kommagetrennt). Bei mehreren Namen -> "Geschäftsführer".
  const managerList = pick(cfg.seller_manager, process.env.SELLER_MANAGER);
  const managerRole = managerList.includes(',')
    ? 'Geschäftsführer'
    : (pick(cfg.seller_manager_role, process.env.SELLER_MANAGER_ROLE) || 'Geschäftsführer');
  return {
    brand: pick(cfg.seller_brand, process.env.SELLER_BRAND) || 'Agrarhero',
    name: pick(cfg.seller_name, process.env.SELLER_NAME),
    legalForm: pick(cfg.seller_legalform, process.env.SELLER_LEGALFORM),
    address: addr,
    street,
    cityLine,
    country: pick(cfg.seller_country, process.env.SELLER_COUNTRY) || 'Deutschland',
    manager: managerList,
    managerRole: managerRole,
    registerCourt: court,
    registerNo: regNo,
    register: [court, regNo].filter(Boolean).join(', '),
    email: pick(cfg.seller_email, process.env.SELLER_EMAIL),
    phone: cleanPhone(pick(cfg.seller_phone, process.env.SELLER_PHONE)),
    web: pick(cfg.seller_web, process.env.SELLER_WEB),
    ustid: pick(cfg.seller_ustid, process.env.SELLER_USTID),
  };
}
module.exports = { info };
