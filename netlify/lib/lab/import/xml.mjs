// A small XML reader for survey files (LimeSurvey .lss, the sheets inside .xlsx). Node built-ins only.
// It never resolves entities from the file (a DOCTYPE or ENTITY declaration is refused), never loads
// anything from a URL, and caps depth and size, so a hostile file cannot expand or hang.
import { ImportError } from './common.mjs';

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => (s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
  if (e[0] === '#') {
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isInteger(n) && n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : '';
  }
  return Object.hasOwn(NAMED, e) ? NAMED[e] : m;
}));

const NAME_CHAR = /[A-Za-z0-9_:.\-]/;

// Returns { name, attrs, children, text } for the root element. `text` is the element's own character data.
export function parseXml(input, { maxNodes = 400000, maxDepth = 60 } = {}) {
  let s = String(input);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  let i = 0, nodes = 0;
  const stack = [], root = { name: '#root', attrs: {}, children: [], text: '' };
  stack.push(root);
  const fail = msg => { throw new ImportError(`The file is not valid XML (${msg}).`); };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) { top.text += decode(s.slice(i)); break; }
    if (lt > i) top.text += decode(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt + 4); if (e < 0) fail('unterminated comment'); i = e + 3; continue; }
    if (s.startsWith('<![CDATA[', lt)) { const e = s.indexOf(']]>', lt + 9); if (e < 0) fail('unterminated CDATA'); top.text += s.slice(lt + 9, e); i = e + 3; continue; }
    if (s.startsWith('<?', lt)) { const e = s.indexOf('?>', lt + 2); if (e < 0) fail('unterminated declaration'); i = e + 2; continue; }
    if (/^<!(DOCTYPE|ENTITY)/i.test(s.slice(lt, lt + 10))) throw new ImportError('This XML file declares a DOCTYPE or entities, which are not accepted for safety. Export the survey again without them.');
    if (s.startsWith('<!', lt)) fail('unexpected declaration');
    if (s[lt + 1] === '/') {
      const e = s.indexOf('>', lt); if (e < 0) fail('unterminated tag');
      const name = s.slice(lt + 2, e).trim();
      if (stack.length < 2 || stack[stack.length - 1].name !== name) fail(`closing tag </${name.slice(0, 40)}> does not match`);
      stack.pop(); i = e + 1; continue;
    }
    // start tag
    let j = lt + 1;
    while (j < s.length && NAME_CHAR.test(s[j])) j++;
    const name = s.slice(lt + 1, j);
    if (!name) fail('bad tag');
    const attrs = {};
    for (;;) {
      while (j < s.length && /\s/.test(s[j])) j++;
      if (s[j] === '>' || (s[j] === '/' && s[j + 1] === '>') || j >= s.length) break;
      let k = j;
      while (k < s.length && NAME_CHAR.test(s[k])) k++;
      if (k === j) fail('bad attribute');
      const an = s.slice(j, k);
      while (k < s.length && /\s/.test(s[k])) k++;
      if (s[k] !== '=') fail('attribute without a value');
      k++;
      while (k < s.length && /\s/.test(s[k])) k++;
      const q = s[k];
      if (q !== '"' && q !== "'") fail('unquoted attribute');
      const e = s.indexOf(q, k + 1); if (e < 0) fail('unterminated attribute');
      attrs[an] = decode(s.slice(k + 1, e));
      j = e + 1;
    }
    if (j >= s.length) fail('unterminated tag');
    const self = s[j] === '/';
    const node = { name, attrs, children: [], text: '' };
    if (++nodes > maxNodes) throw new ImportError('The XML file has too many elements to import.');
    top.children.push(node);
    i = j + (self ? 2 : 1);
    if (!self) { if (stack.length > maxDepth) throw new ImportError('The XML file is nested too deeply.'); stack.push(node); }
  }
  if (stack.length !== 1) fail('unclosed tag');
  const el = root.children[0];
  if (!el) fail('no root element');
  return el;
}

export const child = (n, name) => (n ? n.children.find(c => c.name === name) : undefined);
export const childrenOf = (n, name) => (n ? n.children.filter(c => c.name === name) : []);
// All text beneath a node.
export function textOf(n) { return n ? n.text + n.children.map(textOf).join('') : ''; }
