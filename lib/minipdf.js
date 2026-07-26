const fs = require('fs');
const PAGE_W = 595.28, PAGE_H = 841.89;
const HELV = {
  ' ':278,'!':278,'"':355,'#':556,'$':556,'%':889,'&':667,"'":191,'(':333,')':333,
  '*':389,'+':584,',':278,'-':333,'.':278,'/':278,'0':556,'1':556,'2':556,'3':556,
  '4':556,'5':556,'6':556,'7':556,'8':556,'9':556,':':278,';':278,'<':584,'=':584,
  '>':584,'?':556,'@':1015,'A':667,'B':667,'C':722,'D':722,'E':667,'F':611,'G':778,
  'H':722,'I':278,'J':500,'K':667,'L':556,'M':833,'N':722,'O':778,'P':667,'Q':778,
  'R':722,'S':667,'T':611,'U':722,'V':667,'W':944,'X':667,'Y':667,'Z':611,'[':278,
  '\\':278,']':278,'^':469,'_':556,'`':333,'a':556,'b':556,'c':500,'d':556,'e':556,
  'f':278,'g':556,'h':556,'i':222,'j':222,'k':500,'l':222,'m':833,'n':556,'o':556,
  'p':556,'q':556,'r':333,'s':500,'t':278,'u':556,'v':500,'w':722,'x':500,'y':500,
  'z':500,'{':334,'|':260,'}':334,'~':584,
  'ä':556,'ö':556,'ü':556,'Ä':667,'Ö':778,'Ü':722,'ß':556,'€':556,'§':556,'°':400,'–':556
};
function charWidth(ch) { return (HELV[ch] || 556); }
const WINANSI_SPECIAL = { '€':0x80,'–':0x96,'’':0x92,'‚':0x82,'“':0x93,'”':0x94,'…':0x85,'•':0x95 };
function toWinAnsiBytes(str) {
  const bytes = [];
  for (const ch of String(str)) {
    let code;
    if (WINANSI_SPECIAL[ch] !== undefined) code = WINANSI_SPECIAL[ch];
    else { const cp = ch.codePointAt(0); code = cp <= 0xFF ? cp : 0x3F; }
    if (code === 0x28 || code === 0x29 || code === 0x5C) bytes.push(0x5C);
    bytes.push(code);
  }
  return Buffer.from(bytes);
}
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}
class PDF {
  constructor() { this.chunks = []; this._font = 'H'; this._size = 10; this._color = '#000000'; this.images = []; }
  font(f) { this._font = f; return this; }
  size(s) { this._size = s; return this; }
  color(hex) { this._color = hex; return this; }
  _rg(hex) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
  }
  textWidth(str, size = this._size) { let w = 0; for (const ch of String(str)) w += charWidth(ch); return (w/1000)*size; }
  text(str, x, yTop, opts = {}) {
    const size = opts.size || this._size, font = opts.font || this._font, color = opts.color || this._color;
    let tx = x;
    if (opts.align === 'right' && opts.width) tx = x + opts.width - this.textWidth(str, size);
    else if (opts.align === 'center' && opts.width) tx = x + (opts.width - this.textWidth(str, size))/2;
    const baseline = PAGE_H - yTop - size;
    this.chunks.push(`BT /${font} ${size} Tf ${this._rg(color)} rg ${tx.toFixed(2)} ${baseline.toFixed(2)} Td (`);
    this.chunks.push(toWinAnsiBytes(str));
    this.chunks.push(`) Tj ET\n`);
    return size * 1.2;
  }
  wrap(str, x, yTop, width, opts = {}) {
    const size = opts.size || this._size, lineH = size * (opts.lineHeight || 1.4);
    const words = String(str).split(/\s+/);
    let line = '', y = yTop;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (this.textWidth(test, size) > width && line) { this.text(line, x, y, opts); y += lineH; line = word; }
      else line = test;
    }
    if (line) { this.text(line, x, y, opts); y += lineH; }
    return y;
  }
  rect(x, yTop, w, h, fillHex) {
    const bottom = PAGE_H - yTop - h;
    this.chunks.push(`${this._rg(fillHex)} rg ${x.toFixed(2)} ${bottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`);
    return this;
  }
  line(x1, y1Top, x2, y2Top, colorHex = '#000000', width = 0.5) {
    this.chunks.push(`${this._rg(colorHex)} RG ${width} w ${x1.toFixed(2)} ${(PAGE_H - y1Top).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_H - y2Top).toFixed(2)} l S\n`);
    return this;
  }
  image(jpegPath, x, yTop, w, h) {
    const data = fs.readFileSync(jpegPath);
    const dim = jpegSize(data) || { w: 1, h: 1 };
    const idx = this.images.length;
    this.images.push({ data, pw: dim.w, ph: dim.h });
    const bottom = PAGE_H - yTop - h;
    this.chunks.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${bottom.toFixed(2)} cm /Im${idx} Do Q\n`);
    return this;
  }
  _buildContent() { return Buffer.concat(this.chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c, 'latin1'))); }
  toBuffer() {
    const content = this._buildContent();
    const objs = [];
    const imgStart = 7;
    const xobjDict = this.images.length
      ? ' /XObject << ' + this.images.map((_, k) => `/Im${k} ${imgStart + k} 0 R`).join(' ') + ' >>'
      : '';
    objs[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
    objs[2] = Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'latin1');
    objs[3] = Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /H 4 0 R /HB 5 0 R >>${xobjDict} >> /Contents 6 0 R >>`, 'latin1');
    objs[4] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1');
    objs[5] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1');
    objs[6] = Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]);
    this.images.forEach((img, k) => {
      const head = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${img.pw} /Height ${img.ph} /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${img.data.length} >>\nstream\n`, 'latin1');
      objs[imgStart + k] = Buffer.concat([head, img.data, Buffer.from('\nendstream', 'latin1')]);
    });
    const total = 6 + this.images.length;
    let out = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1');
    const offsets = [];
    for (let i = 1; i <= total; i++) { offsets[i] = out.length; out = Buffer.concat([out, Buffer.from(`${i} 0 obj\n`, 'latin1'), objs[i], Buffer.from('\nendobj\n', 'latin1')]); }
    const xrefPos = out.length;
    let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= total; i++) xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    xref += `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.concat([out, Buffer.from(xref, 'latin1')]);
  }
  save(filePath) { fs.writeFileSync(filePath, this.toBuffer()); return filePath; }
}
module.exports = { PDF, PAGE_W, PAGE_H };
