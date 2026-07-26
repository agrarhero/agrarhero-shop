const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse: parseQS } = require('querystring');
const url = require('url');
const { renderFile } = require('./ejs');

function pathToRegex(pattern) {
  const keys = [];
  const rx = pattern.replace(/\/+$/, '') || '/';
  const parts = rx.split('/').map(seg => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const source = '^' + parts.join('/') + '/?$';
  return { regex: new RegExp(source), keys };
}

class Router {
  constructor() { this.stack = []; }
  _add(method, pattern, handlers) {
    const { regex, keys } = pathToRegex(pattern);
    this.stack.push({ method, regex, keys, handlers, pattern });
  }
  get(p, ...h) { this._add('GET', p, h); return this; }
  post(p, ...h) { this._add('POST', p, h); return this; }
  use(a, b) {
    if (typeof a === 'function') { this.stack.push({ method: null, mw: a }); return this; }
    const prefix = a.replace(/\/+$/, '');
    for (const layer of b.stack) {
      if (layer.mw) { this.stack.push(layer); continue; }
      const combined = (prefix + layer.pattern).replace(/\/+$/, '') || '/';
      const { regex, keys } = pathToRegex(combined);
      this.stack.push({ method: layer.method, regex, keys, handlers: layer.handlers, pattern: combined });
    }
    return this;
  }
  handle(req, res) {
    let idx = 0;
    const stack = this.stack;
    const self = this;
    const next = (err) => {
      if (err) return self._error(err, req, res);
      while (idx < stack.length) {
        const layer = stack[idx++];
        if (layer.mw) {
          try { return layer.mw(req, res, next); } catch (e) { return self._error(e, req, res); }
        }
        if (layer.method !== req.method) continue;
        const m = layer.regex.exec(req.pathName);
        if (!m) continue;
        req.params = {};
        layer.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
        return runHandlers(layer.handlers, req, res, next, self);
      }
      if (self._notFound) return self._notFound(req, res);
      res.statusCode = 404; res.end('Not found');
    };
    next();
  }
  _error(err, req, res) {
    if (this._errorHandler) return this._errorHandler(err, req, res);
    console.error(err);
    if (!res.headersSent) { res.statusCode = 500; res.end('Server error'); }
  }
  setNotFound(fn) { this._notFound = fn; }
  setErrorHandler(fn) { this._errorHandler = fn; }
}

function runHandlers(handlers, req, res, outerNext, router) {
  let i = 0;
  const step = (err) => {
    if (err) return router._error(err, req, res);
    const fn = handlers[i++];
    if (!fn) return outerNext();
    Promise.resolve().then(() => fn(req, res, step)).catch(e => router._error(e, req, res));
  };
  step();
}

function parseMultipart(buf, boundary) {
  const fields = {}, files = {};
  const delim = Buffer.from('--' + boundary);
  let start = buf.indexOf(delim);
  if (start === -1) return { fields, files };
  start += delim.length;
  while (start < buf.length) {
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break; // abschließendes '--'
    if (buf[start] === 0x0d && buf[start + 1] === 0x0a) start += 2;
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const header = buf.slice(start, headerEnd).toString('utf8');
    const contentStart = headerEnd + 4;
    const nextDelim = buf.indexOf(delim, contentStart);
    if (nextDelim === -1) break;
    let contentEnd = nextDelim;
    if (buf[contentEnd - 2] === 0x0d && buf[contentEnd - 1] === 0x0a) contentEnd -= 2;
    const content = buf.slice(contentStart, contentEnd);
    const nameM = header.match(/name="([^"]*)"/i);
    const fileM = header.match(/filename="([^"]*)"/i);
    const name = nameM ? nameM[1] : null;
    if (name) {
      if (fileM && fileM[1]) {
        const ctM = header.match(/Content-Type:\s*([^\r\n]+)/i);
        const fileObj = { filename: fileM[1], contentType: ctM ? ctM[1].trim() : 'application/octet-stream', data: content };
        if (files[name] === undefined) files[name] = fileObj;
        else if (Array.isArray(files[name])) files[name].push(fileObj);
        else files[name] = [files[name], fileObj];
      } else {
        fields[name] = content.toString('utf8');
      }
    }
    start = nextDelim + delim.length;
  }
  return { fields, files };
}

function bodyParser(req, res, next) {
  req.files = {};
  if (req.method !== 'POST' && req.method !== 'PUT') { req.body = {}; return next(); }
  const ct = req.headers['content-type'] || '';
  const chunks = [];
  let size = 0;
  req.on('data', c => { chunks.push(c); size += c.length; if (size > 20e6) req.destroy(); });
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (ct.indexOf('multipart/form-data') === 0) {
      const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
      const boundary = m ? (m[1] || m[2]).trim() : null;
      const parsed = boundary ? parseMultipart(buf, boundary) : { fields: {}, files: {} };
      req.body = parsed.fields; req.files = parsed.files;
    } else {
      const parsed = parseQS(buf.toString('utf8'));
      for (const k in parsed) if (Array.isArray(parsed[k])) parsed[k] = parsed[k][0];
      req.body = parsed;
    }
    next();
  });
  req.on('error', () => { req.body = {}; req.files = {}; next(); });
}

function cookieParser(req, res, next) {
  const header = req.headers.cookie || '';
  req.cookies = {};
  header.split(';').forEach(pair => {
    const i = pair.indexOf('=');
    if (i > -1) req.cookies[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  });
  res._setCookies = [];
  res.cookie = (name, val, opts = {}) => {
    let s = `${name}=${encodeURIComponent(val)}`;
    if (opts.maxAge) s += `; Max-Age=${Math.floor(opts.maxAge / 1000)}`;
    s += `; Path=${opts.path || '/'}`;
    if (opts.httpOnly !== false) s += '; HttpOnly';
    s += '; SameSite=Lax';
    // Secure-Flag automatisch, sobald der Shop ueber HTTPS laeuft (Domain/Server live)
    const secureWanted = opts.secure !== undefined ? opts.secure
      : (String(process.env.SECURE_COOKIES || '').toLowerCase() === 'true'
         || /^https:/i.test(String(process.env.BASE_URL || '')));
    if (secureWanted) s += '; Secure';
    res._setCookies.push(s);
  };
  next();
}

function flushCookies(res) {
  if (res._setCookies && res._setCookies.length && !res.headersSent) res.setHeader('Set-Cookie', res._setCookies);
}

function enhanceRes(app, req, res) {
  res.locals = {};
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (body) => { flushCookies(res); if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(body); };
  res.redirect = (loc) => {
    if (loc === 'back') loc = req.headers.referer || '/';
    flushCookies(res); res.statusCode = 302; res.setHeader('Location', loc); res.end();
  };
  res.render = (view, locals = {}) => {
    const data = Object.assign({}, res.locals, locals);
    const viewsDir = app.get('views');
    const file = path.join(viewsDir, view.endsWith('.ejs') ? view : view + '.ejs');
    const html = renderFile(file, data);
    flushCookies(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  };
}

const MIME = { '.css':'text/css','.js':'application/javascript','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.webp':'image/webp','.gif':'image/gif' };
function staticMw(dir) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const safe = path.normalize(decodeURIComponent(req.pathName)).replace(/^(\.\.[/\\])+/, '');
    const file = path.join(dir, safe);
    if (!file.startsWith(dir)) return next();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return next();
      res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      fs.createReadStream(file).pipe(res);
    });
  };
}

function createApp() {
  const router = new Router();
  const settings = {};
  router.set = (k, v) => { settings[k] = v; };
  router.get = function (a, ...h) {
    if (h.length === 0 && typeof a === 'string') return settings[a];
    return Router.prototype.get.call(this, a, ...h);
  };
  router.static = staticMw;
  router.listen = (port, cb) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      req.pathName = parsed.pathname; req.path = parsed.pathname; req.query = parsed.query; req.originalUrl = req.url;
      enhanceRes(router, req, res);
      cookieParser(req, res, () => bodyParser(req, res, () => router.handle(req, res)));
    });
    server.listen(port, cb);
    return server;
  };
  return router;
}
module.exports = { createApp, Router: () => new Router(), staticMw };
