const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
function readReply(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) { cleanup(); resolve({ code: parseInt(last.slice(0,3),10), text: buf }); }
    };
    const onErr = (e) => { cleanup(); reject(e); };
    const cleanup = () => { socket.removeListener('data', onData); socket.removeListener('error', onErr); };
    socket.on('data', onData); socket.on('error', onErr);
  });
}
function send(socket, line) { socket.write(line + '\r\n'); return readReply(socket); }
function expect(reply, ok) { if (!ok.includes(reply.code)) throw new Error(`SMTP-Fehler ${reply.code}: ${reply.text.trim()}`); return reply; }
function buildMime({ from, to, subject, text, html, attachments, replyTo }) {
  const b1 = 'MIX_' + Math.random().toString(36).slice(2);
  const b2 = 'ALT_' + Math.random().toString(36).slice(2);
  const enc = (s) => Buffer.from(String(s), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  let m = '';
  m += `From: ${from}\r\n`;
  m += `To: ${to}\r\n`;
  if (replyTo) m += `Reply-To: ${replyTo}\r\n`;
  m += `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=\r\n`;
  m += `MIME-Version: 1.0\r\n`;
  m += `Content-Type: multipart/mixed; boundary="${b1}"\r\n\r\n`;
  m += `--${b1}\r\n`;
  m += `Content-Type: multipart/alternative; boundary="${b2}"\r\n\r\n`;
  m += `--${b2}\r\n`;
  m += `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${enc(text || '')}\r\n`;
  if (html) { m += `--${b2}\r\n`; m += `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${enc(html)}\r\n`; }
  m += `--${b2}--\r\n`;
  for (const att of (attachments || [])) {
    const content = fs.readFileSync(att.path).toString('base64').replace(/(.{76})/g, '$1\r\n');
    const name = att.filename || path.basename(att.path);
    m += `--${b1}\r\n`;
    m += `Content-Type: application/pdf; name="${name}"\r\n`;
    m += `Content-Transfer-Encoding: base64\r\n`;
    m += `Content-Disposition: attachment; filename="${name}"\r\n\r\n${content}\r\n`;
  }
  m += `--${b1}--\r\n`;
  return m;
}
async function sendSmtp(cfg, mail) {
  const port = Number(cfg.port || 587);
  const secure = cfg.secure === true || port === 465;
  let socket = secure ? tls.connect({ host: cfg.host, port, servername: cfg.host }) : net.connect({ host: cfg.host, port });
  await new Promise((res, rej) => { socket.once(secure ? 'secureConnect' : 'connect', res); socket.once('error', rej); });
  expect(await readReply(socket), [220]);
  const ehlo = async (s) => expect(await send(s, `EHLO agrarhero`), [250]);
  await ehlo(socket);
  if (!secure) {
    expect(await send(socket, 'STARTTLS'), [220]);
    socket = tls.connect({ socket, host: cfg.host, servername: cfg.host });
    await new Promise((res, rej) => { socket.once('secureConnect', res); socket.once('error', rej); });
    await ehlo(socket);
  }
  expect(await send(socket, 'AUTH LOGIN'), [334]);
  expect(await send(socket, Buffer.from(cfg.user, 'utf8').toString('base64')), [334]);
  expect(await send(socket, Buffer.from(cfg.pass, 'utf8').toString('base64')), [235]);
  const fromAddr = (mail.from.match(/<([^>]+)>/) || [null, mail.from])[1];
  expect(await send(socket, `MAIL FROM:<${fromAddr}>`), [250]);
  const rcpts = [mail.to].concat(Array.isArray(mail.bcc) ? mail.bcc : (mail.bcc ? [mail.bcc] : []));
  for (const r of rcpts) { expect(await send(socket, `RCPT TO:<${r}>`), [250, 251]); }
  expect(await send(socket, 'DATA'), [354]);
  const body = buildMime(mail).replace(/\r\n\./g, '\r\n..');
  socket.write(body + '\r\n.\r\n');
  expect(await readReply(socket), [250]);
  await send(socket, 'QUIT').catch(() => {});
  socket.end();
}
module.exports = { sendSmtp, buildMime };
