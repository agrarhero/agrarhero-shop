// Kombiniert die künstliche Basis (rating_seed_*) mit echten Kundenbewertungen.
const db = require('../db');

function decorate(p) {
  const seedAvg = p.rating_seed_avg != null ? p.rating_seed_avg : 5.0;
  const seedCnt = p.rating_seed_count || 0;
  let realCnt = 0, realSum = 0;
  try {
    const row = db.prepare('SELECT COUNT(*) AS c, COALESCE(SUM(rating),0) AS s FROM reviews WHERE product_id = ?').get(p.id);
    realCnt = row.c; realSum = row.s;
  } catch (e) {}
  const count = seedCnt + realCnt;
  const avg = count ? (seedAvg * seedCnt + realSum) / count : 0;
  p.ratingAvg = Math.round(avg * 10) / 10;
  p.ratingCount = count;
  return p;
}
function decorateAll(list) { list.forEach(decorate); return list; }

// Darf der Nutzer dieses Produkt bewerten? Nur nach Erhalt (Status 'versendet').
function canReview(userId, productId) {
  if (!userId) return false;
  const bought = db.prepare(`SELECT 1 FROM orders o JOIN order_items oi ON oi.order_id = o.id
                             WHERE o.user_id = ? AND oi.product_id = ? AND o.status = 'versendet' LIMIT 1`).get(userId, productId);
  return !!bought;
}
function hasReviewed(userId, productId) {
  if (!userId) return false;
  return !!db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND product_id = ?').get(userId, productId);
}

module.exports = { decorate, decorateAll, canReview, hasReviewed };
