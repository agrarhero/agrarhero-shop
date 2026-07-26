const crypto = require('crypto');
function hashSync(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function compareSync(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
// Passwort-Richtlinie (wie bei seriösen Shops): min. 8 Zeichen, Groß- und
// Kleinbuchstaben, mindestens eine Zahl und ein Sonderzeichen.
function strengthError(password) {
  const pw = String(password || '');
  if (pw.length < 8) return 'Das Passwort muss mindestens 8 Zeichen lang sein.';
  if (!/[a-z]/.test(pw)) return 'Das Passwort muss mindestens einen Kleinbuchstaben (a–z) enthalten.';
  if (!/[A-Z]/.test(pw)) return 'Das Passwort muss mindestens einen Großbuchstaben (A–Z) enthalten.';
  if (!/[0-9]/.test(pw)) return 'Das Passwort muss mindestens eine Zahl (0–9) enthalten.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Das Passwort muss mindestens ein Sonderzeichen enthalten (z. B. ! ? # @ € -).';
  return null;
}
module.exports = { hashSync, compareSync, strengthError };
