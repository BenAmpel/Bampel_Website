// RFC 4180 CSV reader: quoted fields may hold commas, doubled quotes, and line breaks. Also accepts
// semicolon- or tab-separated files (some spreadsheet programs save those). Returns an array of rows.
import { ImportError } from './common.mjs';

export function detectDelimiter(text) {
  const head = text.slice(0, 4000);
  let best = ',', bestN = -1;
  for (const d of [',', ';', '\t']) {
    let n = 0, q = false;
    for (let i = 0; i < head.length; i++) {
      const ch = head[i];
      if (ch === '"') q = !q;
      else if (!q && ch === '\n') break;
      else if (!q && ch === d) n++;
    }
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

export function parseCsv(input, { maxRows = 50000, maxCells = 2000000 } = {}) {
  let s = String(input);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const delim = detectDelimiter(s), rows = [];
  let row = [], cur = '', q = false, cells = 0, i = 0;
  const endRow = () => { row.push(cur); cur = ''; cells += row.length; if (rows.length >= maxRows || cells > maxCells) throw new ImportError('This table is too large to import.'); rows.push(row); row = []; };
  for (; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"' && cur === '') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') endRow();
    else if (ch === '\r') { if (s[i + 1] === '\n') i++; endRow(); }
    else cur += ch;
  }
  if (q) throw new ImportError('The CSV file has a quoted field that never closes. Check for a stray quotation mark.');
  if (cur !== '' || row.length) endRow();
  return rows;
}
