// Sicherheits-/Fake-Risiko-Bewertung je Kunde.
// Reine Hinweise für den Admin – keine automatische Sperre.
// Signale (3): Herkunft (Referrer-Watchlist), Wegwerf-E-Mail, Konten pro IP.
// (E-Mail-Bestätigung und Bestell-Tempo bewusst NICHT als Signal – siehe unten.)

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'sharklasers.com', 'grr.la',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'tempmailo.com',
  'trashmail.com', 'trashmail.de', 'wegwerfemail.de', 'wegwerf-email.de', 'byom.de',
  'yopmail.com', 'yopmail.fr', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc',
  'fakeinbox.com', 'mailnesia.com', 'mohmal.com', 'emailondeck.com', 'spamgourmet.com',
  'throwawaymail.com', 'mailcatch.com', 'tempinbox.com', 'moakt.com', 'inboxkitten.com',
  'einrot.com', 'fakemail.net', 'tempr.email', 'discard.email', 'mailexpire.com',
  'spam4.me', 'mailsac.com', 'tmpmail.org', 'minuteinbox.com', 'burnermail.io', 'promail.pw',
]);

function parseTs(v) {
  if (!v) return Date.now();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) {
    const tz = /[zZ]$|[+\-]\d\d:?\d\d$/.test(v);
    return new Date(v.replace(' ', 'T') + (tz ? '' : 'Z')).getTime();
  }
  const t = new Date(v).getTime();
  return isNaN(t) ? Date.now() : t;
}
function domainOf(email) {
  const parts = String(email || '').split('@');
  return parts[1] ? parts[1].toLowerCase().trim() : '';
}
function parseWatch(raw) {
  return String(raw == null ? 'auktionshilfe' : raw)
    .split(/[,\n;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function assess(cust, orders, db, watchRaw) {
  const watch = parseWatch(watchRaw);
  const signals = [];

  // 1) Herkunft-Warnung – NUR die Beobachtungsliste zaehlt in den Score.
  //    Von welcher Seite der Kunde allgemein kam, steht separat (originInfo) und ist reine Info.
  const ref = String(cust.landing_ref || '').toLowerCase();
  const hit = watch.find(w => w && ref.includes(w));
  if (hit) {
    signals.push({ key: 'ref', level: 'bad', label: 'Herkunft-Warnung', value: cust.landing_ref,
      text: `Der Kunde ist über eine beobachtete Seite („${hit}“) auf den Shop gelangt. Auf solchen Plattformen kursieren Shop-Links, über die gehäuft Troll-/Fake-Bestellungen kommen. Vor Rechnung/Versand besonders genau prüfen.` });
  } else {
    signals.push({ key: 'ref', level: 'ok', label: 'Herkunft-Warnung', value: 'unbedenklich',
      text: 'Die Herkunft steht nicht auf der Beobachtungsliste. Von welcher Seite der Kunde allgemein kam, siehst du oben bei „Kam über“ – das ist reine Information und beeinflusst diese Bewertung nicht.' });
  }

  // 2) Wegwerf-/Temporär-E-Mail
  const dom = domainOf(cust.email);
  if (dom && DISPOSABLE.has(dom)) {
    signals.push({ key: 'mail', level: 'bad', label: 'E-Mail-Typ', value: dom,
      text: 'Wegwerf-/Temporär-E-Mail-Adresse erkannt. Diese werden fast ausschließlich für Fake-Bestellungen oder anonyme Trollerei verwendet.' });
  } else {
    signals.push({ key: 'mail', level: 'ok', label: 'E-Mail-Typ', value: dom || '—',
      text: 'Reguläre E-Mail-Domain – keine bekannte Wegwerf-Adresse.' });
  }

  // 3) Konten pro IP
  const ip = cust.reg_ip || cust.last_ip || '';
  let shared = 0;
  if (ip) {
    try { shared = db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin=0 AND id<>? AND (reg_ip=? OR last_ip=?)").get(cust.id, ip, ip).n; } catch (e) {}
  }
  if (shared >= 2) {
    signals.push({ key: 'ip', level: 'bad', label: 'Konten pro IP', value: (shared + 1) + ' Konten',
      text: 'Von derselben IP-Adresse existieren mehrere Konten. Typisch für Mehrfach-Anmeldungen, um wiederholt Fake-Bestellungen aufzugeben.' });
  } else if (shared === 1) {
    signals.push({ key: 'ip', level: 'warn', label: 'Konten pro IP', value: '2 Konten',
      text: 'Ein weiteres Konto nutzt dieselbe IP-Adresse. Kann harmlos sein (gleiches Büro/gleicher Haushalt), aber im Blick behalten.' });
  } else {
    signals.push({ key: 'ip', level: 'ok', label: 'Konten pro IP', value: 'nur dieses',
      text: 'Keine weiteren Konten von dieser IP-Adresse.' });
  }

  const bad = signals.filter(s => s.level === 'bad').length;
  const warn = signals.filter(s => s.level === 'warn').length;
  const level = bad >= 1 ? 'bad' : (warn >= 2 ? 'bad' : warn >= 1 ? 'warn' : 'ok');
  const summary = level === 'bad'
    ? 'Erhöhtes Risiko – vor Rechnungsstellung und Versand bitte genau prüfen (z. B. konsequent auf Vorkasse/Zahlungseingang bestehen).'
    : level === 'warn'
      ? 'Leicht auffällig – im Blick behalten, aber kein klares Warnsignal.'
      : 'Unauffällig – keine Warnsignale gefunden.';
  const score = signals.filter(s => s.level === 'ok' || s.level === 'info').length;
  return { level, summary, signals, bad, warn, score, scoreMax: signals.length };
}

// Allgemeine, freundliche Herkunfts-Anzeige (rein informativ, kein Score-Einfluss).
// label ist bewusst mit Prefix: "Link: <Quelle>" bei erkannter Herkunft, sonst "Direkt: ...".
function originInfo(ref) {
  const raw = String(ref || '').trim();
  const r = raw.toLowerCase();
  if (!r) return { kind: 'direct', label: 'Direkt: Link manuell eingegeben', short: 'Direkt',
    detail: 'Der Nutzer kam über KEINEN angeklickten Link (z. B. von Kleinanzeigen, WhatsApp oder Facebook), sondern hat den Shop-Link höchstwahrscheinlich kopiert und manuell in die Adressleiste eingegeben – etwa aus einem Verkaufsinserat ohne automatische Weiterleitung. Die genaue Herkunft lässt sich dann technisch nicht tracken.' };
  const platforms = [
    [/kleinanzeigen/, 'Kleinanzeigen'], [/ebay\./, 'eBay'],
    [/facebook|fb\.com|fb\.me|fb\.watch/, 'Facebook'], [/instagram/, 'Instagram'],
    [/google\./, 'Google'], [/bing\./, 'Bing'], [/duckduckgo/, 'DuckDuckGo'],
    [/whatsapp|wa\.me/, 'WhatsApp'], [/(^|\.)t\.me|telegram/, 'Telegram'],
    [/youtube|youtu\.be/, 'YouTube'], [/marktplaats/, 'Marktplaats'],
    [/willhaben/, 'willhaben'], [/quoka/, 'Quoka'], [/(^|\.)markt\.de/, 'markt.de'], [/shpock/, 'Shpock'],
  ];
  for (const [re, name] of platforms) {
    if (re.test(r)) return { kind: 'platform', label: 'Link: ' + name, short: name,
      detail: 'Der Kunde hat einen angeklickten Link von ' + name + ' aufgerufen (Herkunftsseite: ' + raw + ').', domain: raw };
  }
  return { kind: 'site', label: 'Link: ' + raw, short: raw,
    detail: 'Der Kunde hat einen angeklickten Link von ' + raw + ' aufgerufen.', domain: raw };
}

module.exports = { assess, DISPOSABLE, originInfo };
