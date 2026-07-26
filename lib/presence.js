// ============================================================
//  Presence: Live-Erkennung, wer gerade online ist
//  - In-Memory (an die Sitzungen gekoppelt), keine DB-Last pro Request
//  - Zählt eingeloggte Kunden ("online") und anonyme Gäste getrennt
//  - Bots/Crawler werden bei der Gäste-Zählung ausgeklammert
// ============================================================

// Ein Kunde/Gast gilt als "online", wenn seine letzte Aktivität
// (Seitenaufruf oder Heartbeat) höchstens so lange her ist:
const ONLINE_WINDOW_MS = 10 * 60 * 1000; // 10 Minuten (wie vom Betreiber gewünscht)
const GUEST_WINDOW_MS  = 10 * 60 * 1000; // 10 Minuten für "Gäste gerade auf der Seite"
// Alte Einträge werden nach dieser Zeit ganz verworfen (Speicher freigeben):
const PRUNE_AFTER_MS   = 30 * 60 * 1000; // 30 Minuten

// Verlässliche Bot-/Crawler-Kennungen – diese Sitzungen zählen NICHT als Gäste.
const BOT_RE = /bot\b|bot\/|crawler|crawl\b|spider|slurp|bingpreview|facebookexternalhit|externalhit|embedly|quora|pinterest|redditbot|vkshare|whatsapp|telegram|discordbot|skypeuripreview|linkedinbot|twitterbot|applebot|petalbot|semrush|ahrefs|mj12|dotbot|dataprovider|yandex|baiduspider|sogou|exabot|ia_archiver|archive\.org|headless|phantomjs|puppeteer|playwright|lighthouse|gtmetrix|pingdom|uptimerobot|statuscake|python-requests|python-urllib|go-http|java\/|okhttp|libwww|curl\/|wget\/|httpclient|scrapy|httpx|axios\//i;

// sid -> { userId: number|null, at: epoch-ms, bot: bool }
const map = new Map();

function isBot(ua) { return BOT_RE.test(ua || ''); }

// Bei jedem echten Request/Heartbeat aufrufen. sid = Sitzungs-ID.
function touch(sid, userId, ua) {
  if (!sid) return;
  const prev = map.get(sid);
  // Bot-Kennung: aus dem UA ableiten; wenn kein UA vorliegt, alten Wert behalten.
  const bot = ua != null ? isBot(ua) : (prev ? prev.bot : false);
  map.set(sid, { userId: userId != null ? Number(userId) : null, at: Date.now(), bot });
}

// Wenn sich ein Kunde abmeldet: Sitzung sofort auf "Gast" zurückstufen.
function logout(sid) {
  if (!sid) return;
  const e = map.get(sid);
  if (e) e.userId = null;
}

function prune(now) {
  now = now || Date.now();
  for (const [sid, e] of map) if (now - e.at > PRUNE_AFTER_MS) map.delete(sid);
}

// Momentaufnahme: Menge der online eingeloggten User-IDs + Gästezahl.
function snapshot() {
  const now = Date.now();
  prune(now);
  const onlineUserIds = new Set();
  let guests = 0;
  for (const e of map.values()) {
    const age = now - e.at;
    if (e.userId != null) {
      if (age <= ONLINE_WINDOW_MS) onlineUserIds.add(e.userId);
    } else if (!e.bot && age <= GUEST_WINDOW_MS) {
      guests++;
    }
  }
  return { onlineUserIds, guests, onlineCount: onlineUserIds.size };
}

// Ist ein bestimmter Kunde gerade online? (irgendeine seiner Sitzungen aktiv)
function isUserOnline(userId) {
  if (userId == null) return false;
  const uid = Number(userId);
  const now = Date.now();
  for (const e of map.values()) {
    if (e.userId === uid && (now - e.at) <= ONLINE_WINDOW_MS) return true;
  }
  return false;
}

// Regelmäßig aufräumen, unabhängig von Traffic (bindet keinen Node-Exit).
const timer = setInterval(() => prune(), 5 * 60 * 1000);
if (timer.unref) timer.unref();

module.exports = { touch, logout, snapshot, isUserOnline, isBot, ONLINE_WINDOW_MS, GUEST_WINDOW_MS };
