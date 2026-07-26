const { euro, dateDE } = require('./helpers');
const INK = '#22331f', STEEL = '#2f5d34', ACCENT = '#4a9b2f', MUTED = '#6d7563';
// Absolute Logo-URL für E-Mail-Clients (lokale Dev-URLs sind für Empfänger nicht erreichbar).
const MAIL_LOGO = (process.env.BASE_URL && !/localhost|127\.0\.0\.1/.test(process.env.BASE_URL) ? process.env.BASE_URL.replace(/\/+$/, '') : 'https://agrarhero.de') + '/img/logo-mark.jpg';
function shell(title, innerHtml, sellerName) {
  return `<!DOCTYPE html><html lang="de"><body style="margin:0;background:#eef1e6;font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1e6;padding:28px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden">
        <tr><td style="background:${STEEL};padding:18px 32px">
          <img src="${MAIL_LOGO}" width="42" height="42" alt="Agrarhero" style="vertical-align:middle;border-radius:9px;margin-right:12px">
          <span style="font-family:Arial;font-size:20px;font-weight:bold;color:#ffffff;letter-spacing:.5px;vertical-align:middle">AGRARHERO</span>
        </td></tr>
        <tr><td style="height:4px;background:${ACCENT}"></td></tr>
        <tr><td style="padding:32px">${innerHtml}</td></tr>
        <tr><td style="background:#22331f;padding:20px 32px;color:#aab5a2;font-size:12px;line-height:1.6">
          ${sellerName || 'Agrarhero'}<br>
          Güllefässer · Seilwinden · Sägen · Ernteboxen · www.agrarhero.de<br>
          Diese E-Mail wurde automatisch erzeugt.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}
function itemsTable(items) {
  const rows = items.map(it => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #e3e8da"><strong style="color:${INK}">${it.name}</strong>${it.type ? `<br><span style="color:${MUTED};font-size:12px">${it.type}</span>` : ''}</td>
      <td style="padding:8px 0;border-bottom:1px solid #e3e8da;text-align:center;color:${INK}">${it.quantity}×</td>
      <td style="padding:8px 0;border-bottom:1px solid #e3e8da;text-align:right;color:${INK}">${euro(it.unit_cents * it.quantity)}</td>
    </tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 4px">${rows}</table>`;
}
// Einheitlicher Kontakt-Satz für Mails 3–8
function contactHtml(o) {
  return `Wenn Sie Fragen haben, erreichen Sie uns am schnellsten per E-Mail${o.seller_email ? ` unter <strong style="color:${INK}">${o.seller_email}</strong>` : ''}.`;
}
function contactText(o) {
  return `Wenn Sie Fragen haben, erreichen Sie uns am schnellsten per E-Mail${o.seller_email ? ` unter ${o.seller_email}` : ''}.`;
}
function orderConfirmation(order, items) {
  const t = require('./helpers').totals(items, order.tax_rate, order.shipping_cents);
  const name = `${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim() || 'Kundin/Kunde';
  const ship = require('./helpers').orderShipping(order);
  const shipArr = [ship.company, `${ship.first_name} ${ship.last_name}`.trim(), ship.street, `${ship.zip} ${ship.city}`.trim(), ship.country].filter(Boolean);
  const shipHtml = shipArr.join('<br>');
  const shipText = shipArr.join('\n');
  const del = '3-6';
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Vielen Dank für Ihre Bestellung!</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 20px">Bestellnummer <strong style="color:${INK}">${order.order_number}</strong> · ${dateDE(order.created_at)}</p>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>wir haben Ihre Bestellung erhalten und prüfen diese nun. Sie erhalten in Kürze eine separate E-Mail mit Ihrer Rechnung und den Zahlungsdaten.</p>
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};margin:24px 0 4px">Ihre Bestellung</h3>
    ${itemsTable(items)}
    <table role="presentation" width="100%" style="font-size:14px;margin-top:8px">
      <tr><td style="color:${MUTED}">Zwischensumme (netto)</td><td style="text-align:right">${euro(t.subtotal)}</td></tr>
      <tr><td style="color:${MUTED}">zzgl. ${t.taxRate} % MwSt.</td><td style="text-align:right">${euro(t.tax)}</td></tr>
      <tr><td style="padding-top:6px;font-weight:bold;font-size:16px;border-top:2px solid ${STEEL}">Gesamt</td><td style="padding-top:6px;font-weight:bold;font-size:16px;border-top:2px solid ${STEEL};text-align:right">${euro(t.gross)}</td></tr>
    </table>
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};margin:24px 0 4px">Lieferadresse${ship.different ? ' (abweichend)' : ''}</h3>
    <p style="font-size:14px;line-height:1.6;margin:0 0 4px">${shipHtml}</p>
    <div style="background:#f4f6ec;border-radius:8px;padding:14px 16px;margin-top:22px;font-size:13px;color:${MUTED};line-height:1.6">
      <strong style="color:${INK}">So geht es weiter:</strong> Sie erhalten zeitnah die <strong style="color:${INK}">Rechnung per E-Mail</strong>. Nach Zahlungseingang folgt eine Versandbestätigung, und die <strong style="color:${INK}">Spedition meldet sich rechtzeitig</strong> zur Terminabstimmung und setzt die Ware an Ihrem Wunschort ab. Lieferung in der Regel in <strong style="color:${INK}">${del} Werktagen</strong> nach Zahlungseingang. Sie müssen sich um nichts kümmern.<br>
      <span style="color:${INK}">Tipp:</span> Rechnung nicht gefunden? Bitte auch im <strong style="color:${INK}">Spam-/Junk-Ordner</strong> schauen. Status jederzeit im Kundenkonto unter &bdquo;Meine Bestellungen&ldquo;.
    </div>
    <p style="font-size:15px;line-height:1.6;margin-top:22px">${contactHtml(order)}<br>Mit freundlichen Grüßen<br><strong>Ihr Team von Agrarhero</strong></p>`;
  const text = `Sehr geehrte/r ${name},\n\nvielen Dank für Ihre Bestellung ${order.order_number}!\n\n` +
    items.map(it => `- ${it.quantity}x ${it.name} — ${euro(it.unit_cents * it.quantity)}`).join('\n') +
    `\n\nZwischensumme: ${euro(t.subtotal)}\nMwSt (${t.taxRate}%): ${euro(t.tax)}\nGesamt: ${euro(t.gross)}\n\nLieferadresse${ship.different ? ' (abweichend)' : ''}:\n${shipText}\n\nSo geht es weiter: Sie erhalten zeitnah die Rechnung per E-Mail. Nach Zahlungseingang folgt eine Versandbestätigung, und die Spedition meldet sich rechtzeitig zur Terminabstimmung und setzt die Ware an Ihrem Wunschort ab. Lieferung in der Regel in ${del} Werktagen nach Zahlungseingang. Sie müssen sich um nichts kümmern.\nTipp: Rechnung nicht gefunden? Bitte auch im Spam-/Junk-Ordner schauen. Status jederzeit im Kundenkonto unter \"Meine Bestellungen\".\n\n${contactText(order)}\n\nMit freundlichen Grüßen\nIhr Team von Agrarhero`;
  return { subject: `Bestellbestätigung ${order.order_number} – Agrarhero`, html: shell('Bestellbestätigung', inner, order.seller_name), text };
}
function invoiceMail(order, items) {
  const t = require('./helpers').totals(items, order.tax_rate, order.shipping_cents);
  const name = `${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim() || 'Kundin/Kunde';
  const invNo = order.invoice_number || order.order_number;
  const days = order.payment_days || '14', del = order.delivery_days || '3-6';
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Ihre Bestellung wurde freigegeben</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 20px">Rechnung <strong style="color:${INK}">${invNo}</strong> zur Bestellung ${order.order_number}</p>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>vielen Dank für Ihre Bestellung. Ihre Bestellung wurde <strong>geprüft und freigegeben</strong>. Im Anhang finden Sie Ihre Rechnung als PDF.</p>
    <div style="background:#f4f6ec;border-left:4px solid ${ACCENT};border-radius:4px;padding:16px 18px;margin:22px 0;font-size:14px;line-height:1.7">
      <strong style="color:${INK}">Rechnungsbetrag: ${euro(t.gross)}</strong><br>
      Bitte überweisen Sie den Betrag innerhalb von <strong>${days} Werktagen</strong> unter Angabe der Rechnungsnummer <strong>${invNo}</strong>.<br>
      Nach Zahlungseingang liefern wir Ihre Ware innerhalb von <strong>${del} Werktagen</strong>.
    </div>
    <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};margin:8px 0 4px">Bankverbindung</h3>
    <table role="presentation" width="100%" style="font-size:14px;line-height:1.7">
      <tr><td style="color:${MUTED};width:130px">Kontoinhaber</td><td style="color:${INK}">${order.seller_account_holder || order.seller_name || ''}</td></tr>
      <tr><td style="color:${MUTED}">IBAN</td><td style="color:${INK}">${order.seller_iban || ''}</td></tr>
      <tr><td style="color:${MUTED}">BIC</td><td style="color:${INK}">${order.seller_bic || ''}</td></tr>
      <tr><td style="color:${MUTED}">Bank</td><td style="color:${INK}">${order.seller_bank || ''}</td></tr>
      <tr><td style="color:${MUTED}">Verwendungszweck</td><td style="color:${INK}">${invNo}</td></tr>
    </table>
    <div style="background:#fff4e8;border:1px solid #f2d3b6;border-radius:6px;padding:14px 16px;margin-top:16px;font-size:13px;line-height:1.65;color:#8a4b12">
      <strong>Wichtig:</strong> Bitte überweisen Sie ausschließlich auf das oben genannte Konto und geben Sie den
      <strong>Verwendungszweck exakt an</strong>. Kontoinhaber, IBAN und Verwendungszweck (<strong>${invNo}</strong>)
      müssen <strong>1:1 übereinstimmen</strong> – schon kleine Abweichungen verhindern die eindeutige Zuordnung Ihrer
      Zahlung und führen zu <strong>massiven Verzögerungen</strong> bei Bearbeitung und Lieferung.
    </div>
    ${order.invoice_note ? `<p style="font-size:13px;color:${MUTED};margin-top:18px">${order.invoice_note}</p>` : ''}
    <p style="font-size:15px;line-height:1.6;margin-top:22px">${contactHtml(order)}<br>Mit freundlichen Grüßen<br><strong>Ihr Team von Agrarhero</strong></p>`;
  const text = `Sehr geehrte/r ${name},\n\nIhre Bestellung ${order.order_number} wurde geprüft und freigegeben. Im Anhang finden Sie Ihre Rechnung ${invNo}.\n\n` +
    `Rechnungsbetrag: ${euro(t.gross)}\nBitte überweisen Sie innerhalb von ${days} Werktagen unter Angabe der Rechnungsnummer ${invNo}.\nNach Zahlungseingang erfolgt die Lieferung innerhalb von ${del} Werktagen.\n\n` +
    `Bankverbindung:\nKontoinhaber: ${order.seller_account_holder || order.seller_name || ''}\nIBAN: ${order.seller_iban || ''}\nBIC: ${order.seller_bic || ''}\nBank: ${order.seller_bank || ''}\nVerwendungszweck: ${invNo}\n\nWICHTIG: Kontoinhaber, IBAN und Verwendungszweck (${invNo}) müssen 1:1 übereinstimmen. Bereits kleine Abweichungen führen zu massiven Verzögerungen bei Bearbeitung und Lieferung.\n\n${contactText(order)}\n\nMit freundlichen Grüßen\nIhr Team von Agrarhero`;
  return { subject: `Ihre Rechnung ${invNo} – Bestellung ${order.order_number} freigegeben`, html: shell('Rechnung', inner, order.seller_name), text };
}
// ---------- 3) Versandvorbereitung (Zahlungseingang) ----------
function shipmentPreparing(order) {
  const name = `${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim() || 'Kundin/Kunde';
  const del = order.delivery_days || '3-6';
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Zahlungseingang bestätigt</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 20px">Bestellung <strong style="color:${INK}">${order.order_number}</strong></p>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    vielen Dank – wir haben den Zahlungseingang für Ihre Bestellung <strong>${order.order_number}</strong> erhalten und bestätigen diesen hiermit.</p>
    <div style="background:#f4f6ec;border-left:4px solid ${ACCENT};border-radius:4px;padding:16px 18px;margin:22px 0;font-size:14px;line-height:1.7">
      Ihre Bestellung wird nun <strong>für den Versand vorbereitet</strong> und verlässt unser Lager voraussichtlich <strong>innerhalb von ${del} Werktagen</strong>. Sobald die Ware unterwegs ist, informieren wir Sie umgehend per E-Mail mit allen Details zur Zustellung.
    </div>
    <p style="font-size:15px;line-height:1.6">${contactHtml(order)}<br><br>Wir danken Ihnen für Ihr Vertrauen.<br>Mit freundlichen Grüßen<br><strong>Ihr Team von Agrarhero</strong></p>`;
  const text = `Sehr geehrte/r ${name},\n\nwir haben den Zahlungseingang für Ihre Bestellung ${order.order_number} erhalten und bestätigen diesen hiermit. `+
    `Ihre Bestellung wird nun für den Versand vorbereitet und verlässt unser Lager voraussichtlich innerhalb von ${del} Werktagen. Sobald die Ware unterwegs ist, informieren wir Sie umgehend per E-Mail.\n\n${contactText(order)}\n\nMit freundlichen Grüßen\nIhr Team von Agrarhero`;
  return { subject: `Zahlungseingang bestätigt – Bestellung ${order.order_number}`, html: shell('Zahlungseingang', inner, order.seller_name), text };
}

function shipmentDelay(order) {
  const name = `${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim() || 'Kundin/Kunde';
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Aktueller Status Ihrer Bestellung</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 20px">Bestellung <strong style="color:${INK}">${order.order_number}</strong></p>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    wir informieren Sie kurz zum aktuellen Stand Ihrer Bestellung.</p>
    <div style="background:#f4f6ec;border-left:4px solid ${ACCENT};border-radius:4px;padding:16px 18px;margin:22px 0;font-size:14px;line-height:1.7">
      <strong>Grund:</strong> Aufgrund aktuell <strong>hoher Nachfrage</strong> in unserem Lager benötigt die Bearbeitung Ihrer Bestellung <strong>${order.order_number}</strong> etwas mehr Zeit. Die Versandbereitstellung erfolgt daher voraussichtlich <strong>2–3 Werktage später</strong> als üblich.
    </div>
    <p style="font-size:15px;line-height:1.6">Sobald Ihre Sendung unser Lager verlässt, erhalten Sie automatisch die Versandbestätigung mit den Sendungsdetails.<br><br>
    ${contactHtml(order)}<br><br>
    Mit freundlichen Grüßen<br><strong>Ihr Team von Agrarhero</strong></p>`;
  const text = `Sehr geehrte/r ${name},\n\nwir informieren Sie kurz zum aktuellen Stand Ihrer Bestellung ${order.order_number}. `+
    `Grund: Aufgrund aktuell hoher Nachfrage in unserem Lager benötigt die Bearbeitung etwas mehr Zeit; die Versandbereitstellung erfolgt voraussichtlich 2-3 Werktage später als üblich. `+
    `Sobald Ihre Sendung unser Lager verlässt, erhalten Sie automatisch die Versandbestätigung.\n\n${contactText(order)}\n\nMit freundlichen Grüßen\nIhr Team von Agrarhero`;
  return { subject: `Aktueller Status Ihrer Bestellung ${order.order_number}`, html: shell('Bestellstatus', inner, order.seller_name), text };
}

// ---------- 5) Versendet ----------
function shipmentSent(order) {
  const name = `${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim() || 'Kundin/Kunde';
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Ihre Bestellung wurde versendet</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 20px">Bestellung <strong style="color:${INK}">${order.order_number}</strong></p>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    gute Nachrichten – Ihre Bestellung <strong>${order.order_number}</strong> wurde erfolgreich versendet und ist nun auf dem Weg zu Ihnen.</p>
    <div style="background:#f4f6ec;border-left:4px solid ${ACCENT};border-radius:4px;padding:16px 18px;margin:22px 0;font-size:14px;line-height:1.7">
      Die voraussichtliche Zustellung erfolgt innerhalb der nächsten <strong>3–5 Werktage</strong>.<br>
      Die zuständige Spedition hat Ihre Kontaktdaten erhalten und wird sich zur <strong>Terminabstimmung der Anlieferung</strong> direkt mit Ihnen in Verbindung setzen.
    </div>
    <p style="font-size:15px;line-height:1.6">${contactHtml(order)}<br><br>
    Vielen Dank für Ihren Einkauf.<br>Mit freundlichen Grüßen<br><strong>Ihr Team von Agrarhero</strong></p>`;
  const text = `Sehr geehrte/r ${name},\n\nIhre Bestellung ${order.order_number} wurde erfolgreich versendet und ist auf dem Weg zu Ihnen. `+
    `Die voraussichtliche Zustellung erfolgt innerhalb der nächsten 3-5 Werktage. Die zuständige Spedition hat Ihre Kontaktdaten erhalten `+
    `und wird sich zur Terminabstimmung der Anlieferung direkt mit Ihnen in Verbindung setzen.\n\n${contactText(order)}\n\nVielen Dank für Ihren Einkauf.\nIhr Team von Agrarhero`;
  return { subject: `Ihre Bestellung ${order.order_number} wurde versendet`, html: shell('Versandbestätigung', inner, order.seller_name), text };
}


// ---------- 6) E-Mail-Bestaetigung (Double-Opt-in) ----------
function verifyEmail(user, link) {
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Kundin/Kunde';
  const btn = `<a href="${link}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:6px;font-size:15px">E-Mail-Adresse bestätigen</a>`;
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Willkommen bei Agrarhero!</h1>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    vielen Dank für Ihre Registrierung. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren und sich anmelden zu können.</p>
    <div style="text-align:center;margin:28px 0">${btn}</div>
    <p style="font-size:13px;color:${MUTED};line-height:1.6">Der Bestätigungslink ist <strong>24 Stunden</strong> gültig.<br>
    Falls der Button nicht funktioniert, kopieren Sie diese Adresse in Ihren Browser:<br>
    <span style="color:${INK};word-break:break-all">${link}</span></p>
    <p style="font-size:13px;color:${MUTED};margin-top:14px">Tipp: Damit unsere Nachrichten – etwa Bestellbestätigung und Rechnung – zuverlässig ankommen und nicht im Spam-/Junk-Ordner landen, fügen Sie uns bitte zu Ihren Kontakten hinzu.</p>
    <p style="font-size:13px;color:${MUTED};margin-top:14px">Wenn Sie sich nicht registriert haben, können Sie diese E-Mail ignorieren.</p>`;
  const text = `Sehr geehrte/r ${name},\n\nvielen Dank für Ihre Registrierung. Bitte bestätigen Sie Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren:\n${link}\n\nDer Link ist 24 Stunden gültig. Wenn Sie sich nicht registriert haben, ignorieren Sie diese E-Mail.\n\nAgrarhero`;
  return { subject: 'Bitte bestätigen Sie Ihre E-Mail-Adresse – Agrarhero', html: shell('E-Mail bestätigen', inner, ''), text };
}

// ---------- 7) Passwort zuruecksetzen ----------
function passwordReset(user, link) {
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Kundin/Kunde';
  const btn = `<a href="${link}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;padding:14px 26px;border-radius:6px;font-size:15px">Neues Passwort festlegen</a>`;
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Passwort zurücksetzen</h1>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    Sie haben angefordert, Ihr Passwort zurückzusetzen. Klicken Sie auf den Button, um ein neues Passwort festzulegen.</p>
    <div style="text-align:center;margin:28px 0">${btn}</div>
    <p style="font-size:13px;color:${MUTED};line-height:1.6">Der Link ist aus Sicherheitsgründen nur <strong>1 Stunde</strong> gültig.<br>
    Falls der Button nicht funktioniert, kopieren Sie diese Adresse in Ihren Browser:<br>
    <span style="color:${INK};word-break:break-all">${link}</span></p>
    <p style="font-size:13px;color:${MUTED};margin-top:18px">Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail – Ihr Passwort bleibt unverändert.</p>`;
  const text = `Sehr geehrte/r ${name},\n\nSie haben angefordert, Ihr Passwort zurückzusetzen. Legen Sie hier ein neues Passwort fest:\n${link}\n\nDer Link ist 1 Stunde gültig. Wenn Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.\n\nAgrarhero`;
  return { subject: 'Passwort zurücksetzen – Agrarhero', html: shell('Passwort zurücksetzen', inner, ''), text };
}

// Zeitpunkt (UTC-Text) als ms
function tsToMs(v) {
  if (!v) return null;
  const hasTz = /[zZ]$|[+\-]\d\d:?\d\d$/.test(String(v));
  const d = new Date(String(v).replace(' ', 'T') + (hasTz ? '' : 'Z'));
  const ms = d.getTime();
  return isNaN(ms) ? null : ms;
}

// ---------- 8) Zahlungserinnerung (ausführlich, mit Live-Frist) ----------
function paymentReminder(order, items) {
  items = items || [];
  const helpers = require('./helpers');
  const name = `${order.cust_first_name || ''} ${order.cust_last_name || ''}`.trim() || 'Kundin/Kunde';
  const t = items.length ? helpers.totals(items, order.tax_rate, order.shipping_cents) : null;
  const gross = t ? t.gross : Math.round((Number(order.subtotal_cents || 0) + Number(order.shipping_cents || 0)) * (1 + Number(order.tax_rate || 19) / 100));
  const payDays = parseInt(order.payment_days || '14', 10) || 14;
  const inv = order.invoice_number || order.order_number;
  const orderDate = order.created_at ? dateDE(order.created_at) : '';
  const invoiceDate = order.invoice_sent_at ? dateDE(order.invoice_sent_at) : (order.invoice_date ? dateDE(order.invoice_date) : '');

  // Live berechnete Restfrist ab Rechnungsausgang (Fallback: Bestelldatum)
  const anchorMs = tsToMs(order.invoice_sent_at) || tsToMs(order.invoice_date) || tsToMs(order.created_at);
  let fristHtml = '', fristTxt = '', deadlineStr = '';
  if (anchorMs != null) {
    const deadlineMs = anchorMs + payDays * 86400000;
    deadlineStr = dateDE(new Date(deadlineMs).toISOString());
    const daysLeft = Math.ceil((deadlineMs - Date.now()) / 86400000);
    if (daysLeft > 1) { fristHtml = `Ihnen verbleiben noch <strong>${daysLeft} Tage</strong> innerhalb der Zahlungsfrist – diese endet am <strong>${deadlineStr}</strong>.`; fristTxt = `Ihnen verbleiben noch ${daysLeft} Tage innerhalb der Zahlungsfrist (Ende: ${deadlineStr}).`; }
    else if (daysLeft === 1) { fristHtml = `Ihnen verbleibt noch <strong>1 Tag</strong> innerhalb der Zahlungsfrist – diese endet am <strong>${deadlineStr}</strong>.`; fristTxt = `Ihnen verbleibt noch 1 Tag innerhalb der Zahlungsfrist (Ende: ${deadlineStr}).`; }
    else if (daysLeft === 0) { fristHtml = `Die Zahlungsfrist endet <strong>heute</strong> (${deadlineStr}).`; fristTxt = `Die Zahlungsfrist endet heute (${deadlineStr}).`; }
    else { const over = -daysLeft; fristHtml = `Die Zahlungsfrist ist bereits am <strong>${deadlineStr}</strong> abgelaufen (seit ${over} ${over === 1 ? 'Tag' : 'Tagen'}). Wir bitten Sie, den offenen Betrag zeitnah auszugleichen.`; fristTxt = `Die Zahlungsfrist ist bereits am ${deadlineStr} abgelaufen (seit ${over} ${over === 1 ? 'Tag' : 'Tagen'}). Bitte gleichen Sie den offenen Betrag zeitnah aus.`; }
  }

  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Freundliche Zahlungserinnerung</h1>
    <p style="color:${MUTED};font-size:14px;margin:0 0 20px">Bestellung <strong style="color:${INK}">${order.order_number}</strong>${orderDate ? ` vom ${orderDate}` : ''} · Rechnung ${inv}</p>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    sicher ist es Ihrer Aufmerksamkeit nur entgangen: Zu Ihrer Bestellung <strong>${order.order_number}</strong>${orderDate ? ` vom ${orderDate}` : ''}${invoiceDate ? `, für die wir Ihnen am ${invoiceDate} die Rechnung ${inv} übersandt haben,` : ''} konnten wir bislang noch keinen Zahlungseingang verzeichnen.</p>
    ${items.length ? `<h3 style="font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:${MUTED};margin:22px 0 4px">Ihre Bestellung</h3>${itemsTable(items)}` : ''}
    <div style="background:#f4f6ec;border-left:4px solid ${ACCENT};border-radius:4px;padding:16px 18px;margin:22px 0;font-size:14px;line-height:1.8">
      <table role="presentation" width="100%" style="font-size:14px">
        <tr><td style="color:${MUTED}">Rechnungsnummer</td><td style="text-align:right;color:${INK}"><strong>${inv}</strong></td></tr>
        ${invoiceDate ? `<tr><td style="color:${MUTED}">Rechnungsdatum</td><td style="text-align:right;color:${INK}">${invoiceDate}</td></tr>` : ''}
        <tr><td style="color:${MUTED}">Offener Betrag</td><td style="text-align:right;color:${INK}"><strong>${euro(gross)}</strong></td></tr>
        ${deadlineStr ? `<tr><td style="color:${MUTED}">Zahlungsziel</td><td style="text-align:right;color:${INK}">${deadlineStr}</td></tr>` : ''}
      </table>
      ${fristHtml ? `<div style="margin-top:10px;color:${INK}">${fristHtml}</div>` : ''}
    </div>
    <p style="font-size:15px;line-height:1.6">Bitte überweisen Sie den offenen Betrag unter Angabe der Rechnungsnummer <strong>${inv}</strong> auf das in Ihrer Rechnung genannte Konto. Nach Zahlungseingang bereiten wir den Versand Ihrer Ware umgehend vor.</p>
    <p style="font-size:15px;line-height:1.6">Sollten Sie die Zahlung bereits veranlasst haben, betrachten Sie diese Erinnerung bitte als gegenstandslos – in diesem Fall danken wir Ihnen herzlich.<br><br>
    ${contactHtml(order)}<br><br>
    Mit freundlichen Grüßen<br><strong>Ihr Team von Agrarhero</strong></p>`;
  const text = `Sehr geehrte/r ${name},\n\n`+
    `zu Ihrer Bestellung ${order.order_number}${orderDate ? ` vom ${orderDate}` : ''}${invoiceDate ? ` (Rechnung ${inv} vom ${invoiceDate})` : ` (Rechnung ${inv})`} konnten wir bislang noch keinen Zahlungseingang verzeichnen.\n\n`+
    (items.length ? items.map(it => `- ${it.quantity}x ${it.name} — ${euro(it.unit_cents * it.quantity)}`).join('\n') + `\n\n` : '')+
    `Offener Betrag: ${euro(gross)}\nRechnungsnummer: ${inv}${deadlineStr ? `\nZahlungsziel: ${deadlineStr}` : ''}\n${fristTxt}\n\n`+
    `Bitte überweisen Sie den offenen Betrag unter Angabe der Rechnungsnummer ${inv} auf das in Ihrer Rechnung genannte Konto. Nach Zahlungseingang bereiten wir den Versand umgehend vor.\n\n`+
    `Sollten Sie bereits gezahlt haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.\n\n${contactText(order)}\n\nMit freundlichen Grüßen\nIhr Team von Agrarhero`;
  return { subject: `Zahlungserinnerung – Bestellung ${order.order_number} (Rechnung ${inv})`, html: shell('Zahlungserinnerung', inner, order.seller_name), text };
}


// ---------- 9) Willkommens-/Danke-Mail (registriert, noch keine Bestellung) ----------
function welcomeMail(user, opts) {
  opts = opts || {};
  const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Kundin/Kunde';
  const shopUrl = (opts.baseUrl || 'https://agrarhero.de').replace(/\/+$/, '');
  const shopEmail = opts.shopEmail || '';
  const btn = `<a href="${shopUrl}" style="display:inline-block;background:${ACCENT};color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:6px;font-size:15px">Zum Shop</a>`;
  const inner = `
    <h1 style="font-size:22px;margin:0 0 6px">Willkommen bei Agrarhero!</h1>
    <p style="font-size:15px;line-height:1.6">Sehr geehrte/r ${name},<br>
    vielen Dank f&uuml;r Ihre Registrierung. Ihr Kundenkonto ist aktiv &ndash; Sie k&ouml;nnen unseren Shop ab sofort vollst&auml;ndig nutzen.</p>
    <p style="font-size:15px;line-height:1.6">Unter <strong>&bdquo;Mein Konto&ldquo;</strong> sehen Sie jederzeit Ihre Bestellungen, Rechnungen und hinterlegten Daten. Ihren Warenkorb k&ouml;nnen Sie in Ruhe zusammenstellen und Ihre Bestellung bequem online abschlie&szlig;en.</p>
    <div style="text-align:center;margin:28px 0">${btn}</div>
    <p style="font-size:14px;line-height:1.6">Haben Sie Fragen zu Produkten, Mengen oder zur Lieferung? Wir beraten Sie gern pers&ouml;nlich &ndash; antworten Sie einfach auf diese E-Mail${shopEmail ? ` oder schreiben Sie an <strong style="color:${INK}">${shopEmail}</strong>` : ''}.</p>
    <p style="font-size:14px;line-height:1.6;margin-top:16px">Wir freuen uns, Sie als Kundin oder Kunde begr&uuml;&szlig;en zu d&uuml;rfen.<br>Ihr Team von Agrarhero</p>
    <p style="font-size:13px;color:${MUTED};margin-top:16px">Tipp: Damit unsere Nachrichten &ndash; etwa Bestellbest&auml;tigung und Rechnung &ndash; zuverl&auml;ssig ankommen und nicht im Spam-/Junk-Ordner landen, f&uuml;gen Sie uns bitte zu Ihren Kontakten hinzu.</p>`;
  const text = `Sehr geehrte/r ${name},

vielen Dank fuer Ihre Registrierung. Ihr Kundenkonto ist aktiv - Sie koennen unseren Shop ab sofort vollstaendig nutzen.

Unter "Mein Konto" sehen Sie jederzeit Ihre Bestellungen, Rechnungen und hinterlegten Daten. Ihren Warenkorb koennen Sie in Ruhe zusammenstellen und Ihre Bestellung bequem online abschliessen.

Zum Shop: ${shopUrl}

Haben Sie Fragen? Antworten Sie einfach auf diese E-Mail${shopEmail ? ` oder schreiben Sie an ${shopEmail}` : ''}.

Wir freuen uns, Sie als Kundin oder Kunde begruessen zu duerfen.
Ihr Team von Agrarhero`;
  return { subject: 'Willkommen bei Agrarhero – Ihr Konto ist aktiv', html: shell('Willkommen', inner, ''), text };
}

module.exports = { orderConfirmation, invoiceMail, shipmentPreparing, shipmentDelay, shipmentSent, verifyEmail, passwordReset, paymentReminder, welcomeMail };
