// Reads the first sheet of an .xlsx file with Node's zlib: a minimal ZIP central-directory reader, the
// shared strings, and the sheet XML. No other part of the workbook (formulas' results are read as stored,
// styles, drawings, macros) is used. Entries are size-capped so a crafted archive cannot expand without limit.
import { inflateRawSync } from 'node:zlib';
import { ImportError } from './common.mjs';
import { parseXml, child, childrenOf, textOf } from './xml.mjs';

const MAX_ENTRY = 40 * 1024 * 1024;

export function readZip(buf) {
  if (buf.length < 22) throw new ImportError('This is not an .xlsx file (too short).');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ImportError('This is not an .xlsx file (no ZIP directory found). Save the sheet as .xlsx or .csv and try again.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ImportError('The .xlsx file is damaged (bad ZIP directory).');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    entries.set(name, { method, csize, usize, off, flags });
    p += 46 + nlen + elen + clen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return null;
      if (e.flags & 1) throw new ImportError('This .xlsx file is password protected.');
      if (e.usize > MAX_ENTRY) throw new ImportError('A part of the .xlsx file is too large to import.');
      if (e.off + 30 > buf.length || buf.readUInt32LE(e.off) !== 0x04034b50) throw new ImportError('The .xlsx file is damaged (bad entry).');
      const start = e.off + 30 + buf.readUInt16LE(e.off + 26) + buf.readUInt16LE(e.off + 28);
      const data = buf.subarray(start, start + e.csize);
      if (e.method === 0) return Buffer.from(data);
      if (e.method !== 8) throw new ImportError('The .xlsx file uses a compression method that is not supported.');
      try { return inflateRawSync(data, { maxOutputLength: MAX_ENTRY }); }
      catch { throw new ImportError('The .xlsx file is damaged (could not unpack a sheet).'); }
    }
  };
}

const colIndex = ref => { let n = 0; for (const ch of ref.replace(/[0-9]+/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

// Rows of cell text from the first sheet.
export function readXlsx(buf) {
  const zip = readZip(buf);
  const wbXml = zip.read('xl/workbook.xml');
  if (!wbXml) throw new ImportError('This does not look like an Excel workbook (no xl/workbook.xml).');
  const strings = [];
  const ss = zip.read('xl/sharedStrings.xml');
  if (ss) for (const si of childrenOf(parseXml(ss.toString('utf8')), 'si')) strings.push(textOf(si));
  // The first sheet in workbook order; sheet1.xml when the relationship cannot be resolved.
  let target = 'xl/worksheets/sheet1.xml';
  try {
    const wb = parseXml(wbXml.toString('utf8')), sheet = childrenOf(child(wb, 'sheets'), 'sheet')[0];
    const rid = sheet && (sheet.attrs['r:id'] || sheet.attrs.id);
    const rels = zip.read('xl/_rels/workbook.xml.rels');
    if (rid && rels) {
      const rel = childrenOf(parseXml(rels.toString('utf8')), 'Relationship').find(r => r.attrs.Id === rid);
      if (rel && rel.attrs.Target) target = rel.attrs.Target.startsWith('/') ? rel.attrs.Target.slice(1) : 'xl/' + rel.attrs.Target.replace(/^\.\//, '');
    }
  } catch (e) { if (e instanceof ImportError) throw e; }
  const sx = zip.read(target) || zip.read('xl/worksheets/sheet1.xml');
  if (!sx) throw new ImportError('The first sheet of the workbook could not be found.');
  const sheet = parseXml(sx.toString('utf8')), data = child(sheet, 'sheetData'), rows = [];
  for (const r of childrenOf(data, 'row')) {
    const out = [];
    let next = 0;
    for (const c of childrenOf(r, 'c')) {
      const idx = c.attrs.r ? colIndex(c.attrs.r) : next;
      if (idx > 500) continue;
      const t = c.attrs.t, v = child(c, 'v');
      let val = '';
      if (t === 's') val = strings[Number(v ? v.text : -1)] ?? '';
      else if (t === 'inlineStr') val = textOf(child(c, 'is'));
      else if (t === 'b') val = v && v.text.trim() === '1' ? 'TRUE' : 'FALSE';
      else val = v ? v.text : '';
      while (out.length < idx) out.push('');
      out[idx] = val;
      next = idx + 1;
    }
    const rowNum = r.attrs.r ? Number(r.attrs.r) - 1 : rows.length;
    if (rowNum > 50000) break;
    while (rows.length < rowNum) rows.push([]);
    rows[rowNum] = out;
  }
  return rows;
}
