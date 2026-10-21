// CCAIR Behavioral Lab: survey import entry point. importSurvey() reads one uploaded file (Qualtrics .qsf,
// LimeSurvey .lss, a REDCap data dictionary, or the lab's spreadsheet template as CSV or .xlsx) and returns
// { content, report }. It never saves anything; the admin page loads the content into the editor as a draft
// and the normal versioned save does the rest.
import { ImportError, assertSize, LIMITS } from './common.mjs';
import { importQsf } from './qsf.mjs';
import { importLss } from './lss.mjs';
import { importRedcap, looksLikeRedcap } from './redcap.mjs';
import { importSheetText, importXlsx } from './sheet.mjs';
import { parseCsv } from './csv.mjs';

export const FORMATS = ['qsf', 'lss', 'redcap', 'sheet'];

const isZip = buf => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;

// Returns 'qsf' | 'lss' | 'redcap' | 'sheet' (sheet = CSV template or .xlsx), or null.
export function detectFormat(filename, bytes) {
  const name = String(filename || '').toLowerCase();
  if (isZip(bytes)) return 'sheet';
  const head = bytes.subarray(0, 4096).toString('utf8').replace(/^﻿/, '').trimStart();
  if (name.endsWith('.qsf') || (head.startsWith('{') && /"SurveyElements"/.test(bytes.subarray(0, 20000).toString('utf8')))) return 'qsf';
  if (name.endsWith('.lss') || (head.startsWith('<') && /LimeSurveyDocType|<document/i.test(head))) return 'lss';
  if (head.startsWith('<')) return null;
  if (/variable\s*\/?\s*field\s*name/i.test(head.split(/\r?\n/)[0] || '')) return 'redcap';
  if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv') || /[,;\t]/.test(head)) {
    try { return looksLikeRedcap(parseCsv(bytes.toString('utf8'), { maxRows: 30 })) ? 'redcap' : 'sheet'; } catch { return 'sheet'; }
  }
  return null;
}

// body: { format?: 'auto' | one of FORMATS, filename, data (text, or base64 for .xlsx), encoding?: 'base64', options?: { formsAs } }
export function importSurvey(body) {
  body = body && typeof body === 'object' ? body : {};
  const filename = String(body.filename || '').slice(0, 200), data = body.data;
  if (typeof data !== 'string' || !data.length) throw new ImportError('No file was received.');
  const bytes = body.encoding === 'base64' || /\.xlsx$/i.test(filename) ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8');
  assertSize(bytes.length);
  if (!bytes.length) throw new ImportError('The file is empty.');
  const asked = FORMATS.includes(body.format) ? body.format : null;
  const format = asked || detectFormat(filename, bytes);
  if (!format) throw new ImportError('The file format was not recognized. Use a Qualtrics .qsf, a LimeSurvey .lss, a REDCap data dictionary (.csv), or the lab template (.csv or .xlsx).');
  const sourceName = filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 100) || 'Imported survey';
  const text = () => bytes.toString('utf8').replace(/^﻿/, '');
  const opts = { sourceName, ...(body.options && typeof body.options === 'object' ? { formsAs: body.options.formsAs === 'sessions' ? 'sessions' : 'pages' } : {}) };
  let result;
  try {
    if (format === 'qsf') result = importQsf(text(), opts);
    else if (format === 'lss') result = importLss(text(), opts);
    else if (format === 'redcap') result = importRedcap(text(), opts);
    else result = isZip(bytes) ? importXlsx(bytes, opts) : importSheetText(text(), opts);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    console.error('survey import failed', format, e && e.stack);
    throw new ImportError(`This file could not be read as a ${format.toUpperCase()} survey. Check that it is a complete, unmodified export (${e && e.message ? String(e.message).slice(0, 120) : 'unexpected content'}).`);
  }
  result.report.filename = filename;
  result.report.detected = format;
  return result;
}

export { ImportError, LIMITS };
