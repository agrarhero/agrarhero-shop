const fs = require('fs');
const path = require('path');
const { sendSmtp } = require('./smtp');
const PREVIEW_DIR = path.join(__dirname, '..', 'data', 'mail-vorschau');
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
function smtpConfigured() { return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER); }
async function sendMail(opts) {
  const from = process.env.MAIL_FROM || 'Agrarhero <no-reply@localhost>';
  // Kopie jeder ausgehenden Mail ins eigene Postfach (MAIL_BCC), damit der Betreiber
  // alle gesendeten Mails sieht. Nicht doppeln, wenn die Mail ohnehin dorthin geht.
  const bccEnv = (process.env.MAIL_BCC || '').trim();
  const bcc = opts.bcc || (bccEnv && bccEnv !== opts.to ? bccEnv : undefined);
  if (smtpConfigured()) {
    await sendSmtp({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true', user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      { from, ...opts, bcc });
    return { mode: 'smtp', ref: opts.to };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `${stamp}_${(opts.subject || 'mail').replace(/[^\w\-]+/g, '_').slice(0, 40)}`;
  const attachInfo = (opts.attachments || []).map(a => `  - ${a.filename} (${a.path})`).join('\n');
  const body = `An: ${opts.to}\nVon: ${from}\nBetreff: ${opts.subject}\n` + (attachInfo ? `Anhänge:\n${attachInfo}\n` : '') + `\n----- TEXT -----\n${opts.text || ''}\n`;
  fs.writeFileSync(path.join(PREVIEW_DIR, base + '.txt'), body, 'utf8');
  if (opts.html) fs.writeFileSync(path.join(PREVIEW_DIR, base + '.html'), opts.html, 'utf8');
  console.log(`  MAIL [Vorschau] an ${opts.to}: ${base}.txt`);
  return { mode: 'vorschau', ref: base };
}
module.exports = { sendMail, smtpConfigured, PREVIEW_DIR };
