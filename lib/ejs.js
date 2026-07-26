const fs = require('fs');
const path = require('path');
const cache = new Map();
function escapeHtml(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function compile(template) {
  const re = /<%(=|-|#)?([\s\S]*?)%>/g;
  let code = 'var __ejsOut = "";\nwith (__data) {\n';
  let last = 0, m;
  while ((m = re.exec(template)) !== null) {
    const text = template.slice(last, m.index);
    if (text) code += '__ejsOut += ' + JSON.stringify(text) + ';\n';
    const marker = m[1], content = m[2];
    if (marker === '=') code += '__ejsOut += __esc(' + content + ');\n';
    else if (marker === '-') code += '__ejsOut += (' + content + ');\n';
    else if (marker === '#') {}
    else code += content + '\n';
    last = re.lastIndex;
  }
  const tail = template.slice(last);
  if (tail) code += '__ejsOut += ' + JSON.stringify(tail) + ';\n';
  code += '}\nreturn __ejsOut;';
  return new Function('__data', '__esc', code);
}
function renderFile(file, data) {
  const abs = path.resolve(file);
  const stat = fs.statSync(abs);
  let entry = cache.get(abs);
  if (!entry || entry.mtime !== stat.mtimeMs) {
    const tpl = fs.readFileSync(abs, 'utf8');
    entry = { mtime: stat.mtimeMs, fn: compile(tpl) };
    cache.set(abs, entry);
  }
  const dir = path.dirname(abs);
  const scope = Object.assign({}, data);
  scope.include = (rel, extra) => {
    const childData = extra ? Object.assign({}, scope, extra) : scope;
    const childFile = rel.endsWith('.ejs') ? rel : rel + '.ejs';
    return renderFile(path.join(dir, childFile), childData);
  };
  return entry.fn(scope, escapeHtml);
}
module.exports = { renderFile, escapeHtml };
