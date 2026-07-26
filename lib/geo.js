// IP-Ermittlung + Geo-Lookup (Land, Bundesland, Flagge) - nur Bordmittel
const http = require('http');

function clientIp(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  let ip = xff || (req.socket && req.socket.remoteAddress) || '';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}
function isPrivate(ip) {
  if (!ip) return true;
  return ip === '::1' || ip === '127.0.0.1' ||
    /^10\./.test(ip) || /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd');
}
// ISO-2 Ländercode -> Flaggen-Emoji
function flag(cc) {
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}
// Liefert {country, countryCode, region, city} oder null
function lookup(ip) {
  return new Promise((resolve) => {
    if (isPrivate(ip)) return resolve(null);
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org,hosting,proxy,mobile`;
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const r = http.get(url, { timeout: 2500 }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.status === 'success') finish({ country: j.country, countryCode: j.countryCode, region: j.regionName, city: j.city, isp: j.isp||'', org: j.org||'', hosting: !!j.hosting, proxy: !!j.proxy, mobile: !!j.mobile });
          else finish(null);
        } catch { finish(null); }
      });
    });
    r.on('timeout', () => { r.destroy(); finish(null); });
    r.on('error', () => finish(null));
  });
}
module.exports = { clientIp, isPrivate, flag, lookup };
