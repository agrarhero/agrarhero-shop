// Einzige Quelle für die Verkäufer-/Firmendaten (aus .env). Wird in Views (res.locals.seller),
// in der Rechnung und in E-Mails genutzt. Marke (brand) bleibt Agrarhero, rechtlicher
// Verkäufer/Rechnungssteller ist die Firma (name + legalForm + register + manager).
function cleanPhone(p) {
  const raw = String(p || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '').replace(/^49/, '');
  // Platzhalter-Nummern (nur Nullen) nicht anzeigen
  if (!digits || /^0*$/.test(digits)) return '';
  return raw;
}
function info() {
  const addr = String(process.env.SELLER_ADDRESS || '').trim();
  const ci = addr.indexOf(',');
  const street = ci >= 0 ? addr.slice(0, ci).trim() : addr;
  const cityLine = ci >= 0 ? addr.slice(ci + 1).trim() : '';
  const court = String(process.env.SELLER_REGISTER_COURT || '').trim();
  const regNo = String(process.env.SELLER_REGISTER_NO || '').trim();
  // Geschäftsführung direkt aus .env (mehrere Namen kommagetrennt).
  const managerList = String(process.env.SELLER_MANAGER || '').trim();
  const managerRole = managerList.includes(',') ? 'Geschäftsführer' : (String(process.env.SELLER_MANAGER_ROLE || '').trim() || 'Geschäftsführer');
  return {
    brand: process.env.SELLER_BRAND || 'Agrarhero',
    name: String(process.env.SELLER_NAME || '').trim(),
    legalForm: String(process.env.SELLER_LEGALFORM || '').trim(),
    address: addr,
    street,
    cityLine,
    country: String(process.env.SELLER_COUNTRY || 'Deutschland').trim(),
    manager: managerList,
    managerRole: managerRole,
    registerCourt: court,
    registerNo: regNo,
    register: [court, regNo].filter(Boolean).join(', '),
    email: String(process.env.SELLER_EMAIL || '').trim(),
    phone: cleanPhone(process.env.SELLER_PHONE),
    web: String(process.env.SELLER_WEB || '').trim(),
    ustid: String(process.env.SELLER_USTID || '').trim(),
  };
}
module.exports = { info };
