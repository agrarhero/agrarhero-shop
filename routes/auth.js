// ============================================================
//  Authentifizierung: Registrierung (mit E-Mail-Bestätigung),
//  Login, Logout, Passwort vergessen/zurücksetzen, Resend
// ============================================================
const crypto = require('crypto');
const { Router } = require('../lib/app');
const router = Router();
const password = require('../lib/password');
const db = require('../db');
const emails = require('../lib/emails');
const { sendMail } = require('../lib/mailer');
const cart = require('../lib/cart');
const { escapeHtml } = require('../lib/ejs');
const EMAIL_RE = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]{2,}$/;

function baseUrl() { return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''); }
function token() { return crypto.randomBytes(24).toString('hex'); }

// --- Brute-Force-Schutz fuer den Login (in-memory) ---
const LOGIN_MAX = 8;                 // erlaubte Fehlversuche je IP+E-Mail
const LOGIN_WINDOW = 15 * 60 * 1000; // Zeitfenster und Sperrdauer: 15 Minuten
const loginHits = new Map();
function loginKey(req, email) {
  let ip = 'ip'; try { ip = require('../lib/geo').clientIp(req) || 'ip'; } catch (e) {}
  return ip + '|' + (email || '');
}
function loginBlockedMin(key) {
  const e = loginHits.get(key); if (!e) return 0;
  if (e.blockedUntil && e.blockedUntil > Date.now()) return Math.ceil((e.blockedUntil - Date.now()) / 60000);
  if (e.first && Date.now() - e.first > LOGIN_WINDOW) loginHits.delete(key);
  return 0;
}
function loginFail(key) {
  const now = Date.now(); let e = loginHits.get(key);
  if (!e || (e.first && now - e.first > LOGIN_WINDOW)) e = { count: 0, first: now, blockedUntil: 0 };
  e.count++; if (e.count >= LOGIN_MAX) e.blockedUntil = now + LOGIN_WINDOW;
  loginHits.set(key, e);
}
function loginOk(key) { loginHits.delete(key); }
function inHours(h) { return new Date(Date.now() + h * 3600 * 1000).toISOString(); }
function notExpired(iso) { return iso && new Date(iso).getTime() > Date.now(); }

// ---------- Registrierung ----------
router.get('/registrieren', (req, res) => {
  if (req.user) return res.redirect('/konto');
  res.render('register', { title: 'Konto erstellen', form: {}, error: null });
});

router.post('/registrieren', async (req, res) => {
  const b = req.body;
  const email = (b.email || '').trim().toLowerCase();
  const type = (b.customer_type === 'privat') ? 'privat' : 'firma';
  const form = Object.assign({}, b, { customer_type: type });
  const err = (msg) => res.render('register', { title: 'Konto erstellen', form, error: msg });
  const filled = (v) => v && String(v).trim();
  if (!email || !b.password) return err('Bitte E-Mail und Passwort angeben.');
  if (!EMAIL_RE.test(email)) return err('Bitte geben Sie eine gültige E-Mail-Adresse an.');
  { const pe = password.strengthError(b.password); if (pe) return err(pe); }
  if (b.password !== b.password2) return err('Die Passwörter stimmen nicht überein.');
  if (!filled(b.salutation) || !filled(b.first_name) || !filled(b.last_name) || !filled(b.street) || !filled(b.zip) || !filled(b.city) || !filled(b.phone))
    return err('Bitte füllen Sie alle Pflichtfelder aus.');
  if (type === 'firma' && !filled(b.company)) return err('Bitte geben Sie Ihren Firmennamen an.');
  if (!b.agb) return err('Bitte akzeptieren Sie die AGB und die Datenschutzerklärung.');
  const shipDiff = b.ship_diff === 'ja';
  if (shipDiff && (!filled(b.ship_street) || !filled(b.ship_zip) || !filled(b.ship_city)))
    return err('Bitte geben Sie für die abweichende Lieferadresse mindestens Straße, PLZ und Ort an.');
  if (db.prepare('SELECT email FROM banned_emails WHERE email = ?').get(email)) return err('Registrierung mit diesen Daten nicht möglich.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return err('Für diese E-Mail existiert bereits ein Konto. Bitte melden Sie sich an.');

  const vt = token();
  db.prepare(`INSERT INTO users (email, password_hash, customer_type, salutation, first_name, last_name, company, ustid, street, zip, city, country, phone, verified, verify_token, verify_expires)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`).run(
    email, password.hashSync(b.password), type, b.salutation || '', b.first_name || '', b.last_name || '',
    type === 'firma' ? (b.company || '') : '', type === 'firma' ? (b.ustid || '') : '',
    b.street || '', b.zip || '', b.city || '', b.country || 'Deutschland', b.phone || '', vt, inHours(24));

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  try { db.prepare('UPDATE users SET customer_number = ? WHERE id = ?').run(require('../lib/ids').uniqueCustomerNumber(), user.id); } catch (e) {}
  try { db.prepare('UPDATE users SET landing_ref=?, reg_ip=? WHERE id=?').run(req.session.landingRef || '', (require('../lib/geo').clientIp(req) || ''), user.id); } catch (e) {}
  // Im Gäste-Besuchsverlauf den Moment "jetzt Kunde geworden" festhalten.
  try { require('../lib/guestlog').markRegistered(req.sessionId, user.id); } catch (e) {}
  if (shipDiff) {
    db.prepare('UPDATE users SET ship_first_name=?, ship_last_name=?, ship_company=?, ship_street=?, ship_zip=?, ship_city=?, ship_country=? WHERE id=?')
      .run(b.ship_first_name || '', b.ship_last_name || '', b.ship_company || '', b.ship_street || '', b.ship_zip || '', b.ship_city || '', b.ship_country || 'Deutschland', user.id);
  }
  const link = `${baseUrl()}/bestaetigen?token=${vt}`;
  try { const m = emails.verifyEmail(user, link); await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text }); }
  catch (e) { console.error('Verify-Mail-Fehler:', e.message); }

  res.render('message', { title: 'Fast geschafft', heading: 'Bitte bestätigen Sie Ihre E-Mail',
    message: `Wir haben eine Bestätigungs-E-Mail an <strong>${escapeHtml(email)}</strong> gesendet. Bitte klicken Sie auf den Link darin, um Ihr Konto zu aktivieren. Danach können Sie sich anmelden – Ihr Warenkorb bleibt erhalten.`,
    linkHref: '/login', linkText: 'Zur Anmeldung', resendEmail: email, resend: true,
    popup: true, popupEmail: email, spamNote: true });
});

// ---------- E-Mail bestätigen ----------
router.get('/bestaetigen', (req, res) => {
  const t = req.query.token || '';
  const user = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(t);
  if (!user || !notExpired(user.verify_expires)) {
    return res.render('message', { title: 'Link ungültig', heading: 'Link ungültig oder abgelaufen',
      message: 'Dieser Bestätigungslink ist nicht mehr gültig. Sie können sich unten eine neue Bestätigungs-E-Mail zusenden lassen.',
      linkHref: null, linkText: null, resendEmail: '', resend: true });
  }
  db.prepare("UPDATE users SET verified=1, verify_token=NULL, verify_expires=NULL, last_login=datetime('now') WHERE id=?").run(user.id);
  req.session.userId = user.id;
  cart.mergeIntoSession(req.session, user.id);
  req.flash('success', 'Ihre E-Mail wurde bestätigt – willkommen!');
  const to = req.session.returnTo || '/konto';
  delete req.session.returnTo;
  res.redirect(to);
});

// ---------- Bestätigungsmail erneut senden ----------
router.post('/bestaetigung-erneut', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && !user.verified) {
    const vt = token();
    db.prepare('UPDATE users SET verify_token=?, verify_expires=? WHERE id=?').run(vt, inHours(24), user.id);
    try { const m = emails.verifyEmail(user, `${baseUrl()}/bestaetigen?token=${vt}`); await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text }); }
    catch (e) { console.error('Resend-Fehler:', e.message); }
  }
  res.render('message', { title: 'E-Mail gesendet', heading: 'Bestätigungs-E-Mail gesendet',
    message: `Falls für <strong>${escapeHtml(email)}</strong> ein noch nicht bestätigtes Konto existiert, haben wir eine neue Bestätigungs-E-Mail gesendet.`,
    linkHref: '/login', linkText: 'Zur Anmeldung', resendEmail: '', resend: false });
});

// ---------- Login ----------
router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/konto');
  res.render('login', { title: 'Anmelden', error: null, email: '', unverified: false });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const bfKey = loginKey(req, email);
  const waitMin = loginBlockedMin(bfKey);
  if (waitMin) {
    return res.render('login', { title: 'Anmelden', error: `Zu viele Fehlversuche. Bitte versuchen Sie es in ${waitMin} Minute(n) erneut oder setzen Sie Ihr Passwort zurück.`, email, unverified: false });
  }
  const banned = db.prepare('SELECT email FROM banned_emails WHERE email = ?').get(email);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (banned || !user || !password.compareSync(req.body.password || '', user.password_hash)) {
    loginFail(bfKey);
    return res.render('login', { title: 'Anmelden', error: 'E-Mail oder Passwort ist falsch.', email, unverified: false });
  }
  if (!user.verified) {
    return res.render('login', { title: 'Anmelden', error: 'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse.', email, unverified: true });
  }
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(user.id);
  loginOk(bfKey);
  req.session.userId = user.id;
  cart.mergeIntoSession(req.session, user.id);
  req.flash('success', 'Sie sind angemeldet.');
  const to = req.session.returnTo || (user.is_admin ? '/admin' : '/konto');
  delete req.session.returnTo;
  res.redirect(to);
});

router.post('/logout', (req, res) => {
  req.session.userId = null;
  require('../lib/presence').logout(req.sessionId); // Sitzung sofort auf "Gast" zuruecksetzen
  req.flash('info', 'Sie wurden abgemeldet.');
  res.redirect('/');
});

// ---------- Passwort vergessen ----------
router.get('/passwort-vergessen', (req, res) => {
  res.render('password-forgot', { title: 'Passwort vergessen', sent: false, email: '' });
});
router.post('/passwort-vergessen', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (user && !user.is_admin) {
    const rt = token();
    db.prepare('UPDATE users SET reset_token=?, reset_expires=? WHERE id=?').run(rt, inHours(1), user.id);
    try { const m = emails.passwordReset(user, `${baseUrl()}/passwort-zuruecksetzen?token=${rt}`); await sendMail({ to: email, subject: m.subject, html: m.html, text: m.text }); }
    catch (e) { console.error('Reset-Mail-Fehler:', e.message); }
  }
  res.render('password-forgot', { title: 'Passwort vergessen', sent: true, email });
});

// ---------- Passwort zurücksetzen ----------
router.get('/passwort-zuruecksetzen', (req, res) => {
  const t = req.query.token || '';
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(t);
  if (!user || !notExpired(user.reset_expires)) {
    return res.render('message', { title: 'Link ungültig', heading: 'Link ungültig oder abgelaufen',
      message: 'Dieser Link zum Zurücksetzen ist nicht mehr gültig. Bitte fordern Sie einen neuen an.',
      linkHref: '/passwort-vergessen', linkText: 'Neuen Link anfordern', resendEmail: '', resend: false });
  }
  res.render('password-reset', { title: 'Neues Passwort', token: t, error: null });
});
router.post('/passwort-zuruecksetzen', (req, res) => {
  const t = req.body.token || '';
  const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(t);
  if (!user || !notExpired(user.reset_expires)) {
    return res.render('message', { title: 'Link ungültig', heading: 'Link ungültig oder abgelaufen',
      message: 'Dieser Link zum Zurücksetzen ist nicht mehr gültig. Bitte fordern Sie einen neuen an.',
      linkHref: '/passwort-vergessen', linkText: 'Neuen Link anfordern', resendEmail: '', resend: false });
  }
  const pw = req.body.password || '';
  { const pe = password.strengthError(pw); if (pe) return res.render('password-reset', { title: 'Neues Passwort', token: t, error: pe }); }
  if (pw !== req.body.password2) return res.render('password-reset', { title: 'Neues Passwort', token: t, error: 'Die Passwörter stimmen nicht überein.' });
  db.prepare("UPDATE users SET password_hash=?, reset_token=NULL, reset_expires=NULL, verified=1 WHERE id=?").run(password.hashSync(pw), user.id);
  req.session.userId = user.id;
  req.flash('success', 'Ihr Passwort wurde geändert. Sie sind angemeldet.');
  res.redirect('/konto');
});

module.exports = router;
